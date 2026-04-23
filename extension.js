const vscode = require('vscode');

const PRIMARY_COMMAND_ID = 'foldDirectChildren.toggle';

const TYPE_SYMBOL_KINDS = new Set([
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Struct,
  vscode.SymbolKind.Enum,
]);

const TOP_LEVEL_DECLARATION_KINDS = new Set([
  ...TYPE_SYMBOL_KINDS,
  vscode.SymbolKind.Function,
]);

const WRAPPER_SYMBOL_KINDS = new Set([
  vscode.SymbolKind.File,
  vscode.SymbolKind.Module,
  vscode.SymbolKind.Namespace,
  vscode.SymbolKind.Package,
]);

const foldingStateByTarget = new Map();

function activate(context) {
  const commandHandler = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const originalSelections = editor.selections.map(
      (selection) => new vscode.Selection(selection.anchor, selection.active),
    );
    const originalPrimaryPosition = editor.selection.active;

    const foldingRanges = await vscode.commands.executeCommand(
      'vscode.executeFoldingRangeProvider',
      editor.document.uri,
    );

    if (!Array.isArray(foldingRanges) || foldingRanges.length === 0) {
      return;
    }

    const rootNodes = buildFoldingTree(foldingRanges);
    const cursorLine = originalPrimaryPosition.line;
    const currentNode = findInnermostContainingNode(rootNodes, cursorLine);

    let targetNodes = [];
    let selectionLines = [];

    if (currentNode) {
      targetNodes = currentNode.children.filter(isCodeFoldingNode);
      if (targetNodes.length === 0) {
        targetNodes = currentNode.children;
      }
      selectionLines = getSelectionLinesFromNodes(targetNodes);
    } else {
      selectionLines = await getTopLevelDeclarationLines(editor.document.uri);
      if (selectionLines.length === 0) {
        targetNodes = rootNodes.filter(isCodeFoldingNode);
        if (targetNodes.length === 0) {
          targetNodes = rootNodes;
        }
        selectionLines = getSelectionLinesFromNodes(targetNodes);
      }
    }

    if (selectionLines.length === 0) {
      return;
    }

    const targetKey = getTargetKey(editor.document.uri, currentNode, selectionLines);
    const shouldUnfold = foldingStateByTarget.get(targetKey) === true;

    await vscode.commands.executeCommand(shouldUnfold ? 'editor.unfold' : 'editor.fold', {
      selectionLines,
    });

    foldingStateByTarget.set(targetKey, !shouldUnfold);

    if (canRestoreSelections(originalSelections, targetNodes)) {
      editor.selections = originalSelections;
    }

    if (!isLineHiddenByAnyTarget(originalPrimaryPosition.line, targetNodes)) {
      const range = new vscode.Range(originalPrimaryPosition, originalPrimaryPosition);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(PRIMARY_COMMAND_ID, commandHandler),
    vscode.workspace.onDidChangeTextDocument((event) => {
      clearDocumentState(event.document.uri);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      clearDocumentState(document.uri);
    }),
  );
}

function deactivate() {}

function buildFoldingTree(foldingRanges) {
  const nodes = foldingRanges
    .map((range) => ({
      start: range.start,
      end: range.end,
      kind: range.kind,
      children: [],
    }))
    .sort((left, right) => {
      if (left.start !== right.start) {
        return left.start - right.start;
      }
      return right.end - left.end;
    });

  const roots = [];
  const stack = [];

  for (const node of nodes) {
    while (stack.length > 0 && node.start > stack[stack.length - 1].end) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent && node.start > parent.start && node.end <= parent.end) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    stack.push(node);
  }

  return roots;
}

function findInnermostContainingNode(nodes, line) {
  let match;

  for (const node of nodes) {
    if (node.start <= line && line <= node.end) {
      const childMatch = findInnermostContainingNode(node.children, line);
      match = childMatch || node;
    }
  }

  return match;
}

function isCodeFoldingNode(node) {
  return node.kind !== vscode.FoldingRangeKind.Comment
    && node.kind !== vscode.FoldingRangeKind.Imports
    && node.kind !== vscode.FoldingRangeKind.Region;
}

function getSelectionLinesFromNodes(nodes) {
  return [...new Set(nodes.map((node) => node.start))].sort((left, right) => left - right);
}

async function getTopLevelDeclarationLines(uri) {
  const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri);
  if (!Array.isArray(symbols) || symbols.length === 0 || !('selectionRange' in symbols[0])) {
    return [];
  }

  let topLevelSymbols = symbols;

  if (topLevelSymbols.length === 1 && isWrapperSymbol(topLevelSymbols[0]) && topLevelSymbols[0].children.length > 0) {
    topLevelSymbols = topLevelSymbols[0].children;
  } else if (topLevelSymbols.every(isWrapperSymbol)) {
    topLevelSymbols = topLevelSymbols.flatMap((symbol) => symbol.children);
  }

  let declarationSymbols = topLevelSymbols.filter((symbol) => TYPE_SYMBOL_KINDS.has(symbol.kind));
  if (declarationSymbols.length === 0) {
    declarationSymbols = topLevelSymbols.filter((symbol) => TOP_LEVEL_DECLARATION_KINDS.has(symbol.kind));
  }

  return [...new Set(
    declarationSymbols.map((symbol) => symbol.selectionRange.start.line),
  )].sort((left, right) => left - right);
}

function isWrapperSymbol(symbol) {
  return WRAPPER_SYMBOL_KINDS.has(symbol.kind);
}

function getTargetKey(uri, currentNode, selectionLines) {
  const scopeKey = currentNode
    ? `${currentNode.start}:${currentNode.end}`
    : 'top-level';

  return `${uri.toString()}|${scopeKey}|${selectionLines.join(',')}`;
}

function clearDocumentState(uri) {
  const uriPrefix = `${uri.toString()}|`;

  for (const key of foldingStateByTarget.keys()) {
    if (key.startsWith(uriPrefix)) {
      foldingStateByTarget.delete(key);
    }
  }
}

function canRestoreSelections(selections, targetNodes) {
  return selections.every((selection) => {
    return !isLineHiddenByAnyTarget(selection.anchor.line, targetNodes)
      && !isLineHiddenByAnyTarget(selection.active.line, targetNodes);
  });
}

function isLineHiddenByAnyTarget(line, targetNodes) {
  return targetNodes.some((node) => isLineHiddenByNode(line, node));
}

function isLineHiddenByNode(line, node) {
  return node.start < line && line <= node.end;
}

module.exports = {
  activate,
  deactivate,
};
