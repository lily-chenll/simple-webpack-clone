const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;

const t = require("@babel/types");

const getFileAbsolutePath = require("./getFilePath");
const EXPORTS = "_exports";
const GET_MODULE = "_getModule";

let moduleGraph;
let visitedModule;

const buildModuleGraph = (entryFile, outputFolder) => {
  moduleGraph = "";
  visitedModule = new Set();

  try {
    buildGraph(entryFile);
    const outputFile = path.join(outputFolder, "index.js");
    fs.writeFileSync(outputFile, buildTemplate(entryFile));

    // garbage collection
    moduleGraph = null;
    visitedModule = null;
    return outputFile;
  } catch (e) {
    throw e;
  }
};

// TODO: Better way to write into file
const buildTemplate = (entryFile) => {
  return `const moduleGraph = {\n${moduleGraph}};

(function () {
  const entryFilePath = '${entryFile}';

  const memoModule = {};

  const _getModule = path => {
    if (memoModule[path]) {
      return memoModule[path];
    }

    memoModule[path] = {};
    moduleGraph[path](memoModule[path], _getModule);
    return memoModule[path];
  }

  moduleGraph[entryFilePath]({}, _getModule);
})();`;
};

const getFunc = (code) => `function(${EXPORTS}, ${GET_MODULE}){\n${code}\n}`;

const getReExportVariables = (node) => {
  // [localName, exportName]
  const imports = [];

  if (t.isExportAllDeclaration(node)) {
    return [["*", "*"]];
  }

  node.specifiers.forEach((specifier) => {
    if (t.isExportSpecifier(specifier)) {
      imports.push([specifier.exported, specifier.local]);
    } else if (t.isExportNamespaceSpecifier(specifier)) {
      imports.push([specifier.exported, "*"]);
    }
  });

  return imports;
};

// To build id map
const getIdMemberExpression = (objName, property) =>
  property
    ? t.memberExpression(
        t.identifier(objName),
        t.isIdentifier(property) ? property : t.identifier(property)
      )
    : t.identifier(objName);

const buildImportIdMap = (node, mapName, map) => {
  node.specifiers.forEach((specifier) => {
    if (t.isImportDefaultSpecifier(specifier)) {
      map[specifier.local.name] = getIdMemberExpression(mapName, "default");
    } else if (t.isImportSpecifier(specifier)) {
      map[specifier.local.name] = getIdMemberExpression(
        mapName,
        specifier.imported.name
      );
    }
  });
};

const getExportsVariables = (node) => {
  if (t.isExportNamedDeclaration(node)) {
    if (t.isFunctionDeclaration(node.declaration)) {
      return [[node.declaration.id, node.declaration.id, node.declaration]];
    } else if (t.isVariableDeclaration(node.declaration)) {
      return node.declaration.declarations.map((declarator) => [
        declarator.id,
        declarator.id,
        t.variableDeclaration(node.declaration.kind, [declarator]),
      ]);
    } else {
      // for export list
      return node.specifiers.map((specifier) => [
        specifier.exported,
        specifier.local,
      ]);
    }
  }

  // exportDefaultDeclaration
  const isDefaultVarOrAnonyFunc = !(
    t.isDeclaration(node.declaration) && node.declaration.id
  );
  return [
    [
      t.identifier("default"),
      isDefaultVarOrAnonyFunc ? node.declaration : node.declaration.id,
      isDefaultVarOrAnonyFunc ? null : node.declaration,
    ],
  ];
};

const buildGetModuleExpression = (filePath, param = "*") => {
  if (param === "*") {
    return t.callExpression(t.identifier(GET_MODULE), [
      t.stringLiteral(filePath),
    ]);
  }
  return t.memberExpression(
    t.callExpression(t.identifier(GET_MODULE), [t.stringLiteral(filePath)]),
    param
  );
};

// TODO: better way to handle export all expression
// TODO: Use babel/template not type?
const buildExportAllExpression = (filePath) => {
  const temp = t.identifier("temp");
  //  NOTE: export * from 'XX' doesn't include default
  // Object.assign(_exports, ((...temp) => {delete temp.default; return temp})(_getModule('XXX')))
  return t.expressionStatement(
    t.callExpression(
      t.memberExpression(t.identifier("Object"), t.identifier("assign")),
      [
        t.identifier(EXPORTS),
        t.callExpression(
          t.arrowFunctionExpression(
            [t.objectPattern([t.restElement(temp)])],
            t.blockStatement([
              t.expressionStatement(
                t.unaryExpression(
                  "delete",
                  t.memberExpression(temp, t.identifier("default"))
                )
              ),
              t.returnStatement(temp),
            ])
          ),
          [buildGetModuleExpression(filePath)]
        ),
      ]
    )
  );
};

const buildExportExpression = (id) => {
  return getIdMemberExpression(EXPORTS, id);
};

const buildGraph = (filePath) => {
  if (visitedModule.has(filePath)) return;
  visitedModule.add(filePath);
  const sourceCode = String(fs.readFileSync(filePath));
  const fileAST = babel.parseSync(sourceCode);

  transform()(fileAST, filePath);

  const { code } = generate(fileAST);
  moduleGraph += `${JSON.stringify(filePath)}: ${getFunc(code)},\n`;
};

const transform = () => {
  const importIdMap = {};
  const exportIdMap = {};
  let idIndex = 0;

  return (ast, filePath) => {
    traverse(ast, {
      ImportDeclaration(path) {
        const importedFileRelativePath = path.node.source.value;
        const newName = t.isImportNamespaceSpecifier(path.node.specifiers[0])
          ? path.node.specifiers[0].local.name
          : `_v${idIndex++}`;

        buildImportIdMap(path.node, newName, importIdMap);

        const importedFileAbsolutePath = getFileAbsolutePath(
          importedFileRelativePath,
          filePath
        );

        buildGraph(importedFileAbsolutePath);

        const replacement = path.node.specifiers.length
          ? t.variableDeclaration("const", [
              t.variableDeclarator(
                t.identifier(newName),
                buildGetModuleExpression(importedFileAbsolutePath)
              ),
            ])
          : buildGetModuleExpression(importedFileAbsolutePath);

        path.replaceWith(replacement);
      },
      ExportDeclaration(path) {
        // TODO: Better way to handle export statements
        let replacements = [];
        let isPush = false;
        if (path.node.source) {
          // for re-exports
          const importedFileRelativePath = path.node.source.value;
          const importedVariables = getReExportVariables(path.node);
          const importedFileAbsolutePath = getFileAbsolutePath(
            importedFileRelativePath,
            filePath
          );

          buildGraph(importedFileAbsolutePath);

          replacements = importedVariables.map((_v) =>
            _v[0] === "*"
              ? buildExportAllExpression(importedFileAbsolutePath)
              : t.expressionStatement(
                  t.assignmentExpression(
                    "=",
                    buildExportExpression(_v[0]),
                    buildGetModuleExpression(importedFileAbsolutePath, _v[1])
                  )
                )
          );
        } else {
          const exports = getExportsVariables(path.node);
          // for export list
          isPush = !!(!path.node.declaration && path.node.specifiers);

          exports.forEach((_e) => {
            const [id, ref, declaration] = _e;
            if (declaration) {
              replacements.push(declaration);
            }
            if (!isPush && ref?.name) {
              exportIdMap[ref.name] = buildExportExpression(id);
            }
            replacements.push(
              t.expressionStatement(
                t.assignmentExpression("=", buildExportExpression(id), ref)
              )
            );
          });
        }

        if (isPush) {
          path.container.push(...replacements);
          path.remove();
        } else {
          path.replaceWithMultiple(replacements);
        }
      },
      Identifier(path) {
        const pathWithBinding = path.scope.getBinding(path.node.name)?.path;
        if (
          path.isReferencedIdentifier() &&
          t.isProgram(pathWithBinding?.scope?.block)
        ) {
          if (importIdMap[path.node.name]) {
            path.replaceWith(importIdMap[path.node.name]);
          } else if (exportIdMap[path.node.name]) {
            const isExportAssignment =
              t.isAssignmentExpression(path.parentPath.node) &&
              path.parentPath.node?.left?.object?.name === EXPORTS;
            if (!isExportAssignment)
              path.replaceWith(exportIdMap[path.node.name]);
          }
        }
      },
    });
  };
};

module.exports = buildModuleGraph;
