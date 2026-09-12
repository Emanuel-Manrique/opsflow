"use strict";

function patternSpansMultipleLines(node) {
  if (node == null || node.loc == null) return false;
  return node.loc.start.line !== node.loc.end.line;
}

function isDestructuringPattern(node) {
  return node.type === "ObjectPattern" || node.type === "ArrayPattern";
}

function reportMultilineDestructuring(context, patternNode) {
  if (!isDestructuringPattern(patternNode)) return;
  if (patternNode.typeAnnotation != null) return;
  if (!patternSpansMultipleLines(patternNode)) return;
  context.report({ node: patternNode, messageId: "multilineDestructuring" });
}

function checkParam(context, param) {
  if (param.type === "AssignmentPattern") {
    reportMultilineDestructuring(context, param.left);
    return;
  }
  reportMultilineDestructuring(context, param);
}

function checkFunctionParams(context, node) {
  for (const param of node.params) {
    checkParam(context, param);
  }
}

module.exports = {
  meta: { name: "ops", version: "1.0.0" },
  rules: {
    "no-multiline-import": {
      meta: {
        type: "layout",
        docs: {
          description:
            "Disallow import declarations that span multiple lines; keep one import per line or split into separate import statements."
        },
        schema: [],
        messages: {
          multiline:
            "Import must be a single line. Either put the whole import on one line or split into multiple import statements from the same module."
        }
      },
      create(context) {
        return {
          ImportDeclaration(node) {
            const start = node.loc?.start?.line;
            const end = node.loc?.end?.line;
            if (start == null || end == null) return;
            if (start === end) return;
            context.report({ node, messageId: "multiline" });
          }
        };
      }
    },
    "no-multiline-destructuring": {
      meta: {
        type: "layout",
        docs: {
          description:
            "Disallow object/array destructuring patterns that span multiple lines; use one line or several separate destructuring assignments. Patterns with a TypeScript type annotation (e.g. `({ a }: Props) =>`) are skipped so param typing stays idiomatic."
        },
        schema: [],
        messages: {
          multilineDestructuring:
            "Destructuring pattern must be a single line. Either put the whole pattern on one line or split into multiple destructuring statements."
        }
      },
      create(context) {
        return {
          VariableDeclarator(node) {
            reportMultilineDestructuring(context, node.id);
          },
          AssignmentExpression(node) {
            if (node.operator !== "=") return;
            reportMultilineDestructuring(context, node.left);
          },
          FunctionDeclaration(node) {
            checkFunctionParams(context, node);
          },
          FunctionExpression(node) {
            checkFunctionParams(context, node);
          },
          ArrowFunctionExpression(node) {
            checkFunctionParams(context, node);
          },
          CatchClause(node) {
            if (node.param) checkParam(context, node.param);
          },
          ForInStatement(node) {
            if (node.left.type === "VariableDeclaration") return;
            reportMultilineDestructuring(context, node.left);
          },
          ForOfStatement(node) {
            if (node.left.type === "VariableDeclaration") return;
            reportMultilineDestructuring(context, node.left);
          }
        };
      }
    },
    "no-multiline-ternary": {
      meta: {
        type: "layout",
        docs: {
          description:
            "Disallow ternary expressions that span multiple lines; use if/else when a conditional needs more than one line."
        },
        schema: [],
        messages: {
          multilineTernary:
            "Ternary expression must be a single line. Use if/else when the conditional needs multiple lines."
        }
      },
      create(context) {
        return {
          ConditionalExpression(node) {
            const start = node.loc?.start?.line;
            const end = node.loc?.end?.line;
            if (start == null || end == null) return;
            if (start === end) return;
            context.report({ node, messageId: "multilineTernary" });
          }
        };
      }
    }
  }
};
