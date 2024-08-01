const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const types = require('@babel/types');
const fs = require('fs');
const path = require('path');

const sourceCodeDir = './src';
const outputCodeDir = './src';
const readmeFilePath = './README.md';
let collectedComments = [];
class FileProcessor {
  constructor(sourceDir, outputDir) {
    this.sourceDir = sourceDir;
    this.outputDir = outputDir;
  }

  processFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const ast = parser.parse(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript'],
      attachComment: true,
    });

    // TO DEBUG AST
    // const astJson = JSON.stringify(ast, null, 2);
    // const astJsonFilePath = filePath + '.ast.json';
    // fs.writeFileSync(astJsonFilePath, astJson);

    ast.comments = ast.comments.filter((comment) => {
      const isTargetComment = comment.value.includes('#DOCMAP_v0.0.1:');
      if (isTargetComment) {
        // Extract everything after #DOCMAP_v0.0.1: and remove leading asterisks
        const cleanedComment = comment.value
          .substring(
            comment.value.indexOf('#DOCMAP_v0.0.1:') + '#DOCMAP_v0.0.1:'.length
          ) // Extract after the tag
          .split('\n') // Split by newline to process each line
          .map((line) => line.replace(/^ \* /, '')) // Remove leading asterisk and spaces for each line
          .join('\n') // Rejoin the lines with newline characters preserved
          .trim();

        collectedComments.push(cleanedComment);
      }
      return !isTargetComment;
    });

    const visitor = {
      Program(path) {
        path.traverse({
          enter(nodePath) {
            if (nodePath.node.leadingComments) {
              nodePath.node.leadingComments =
                nodePath.node.leadingComments.filter((comment) => {
                  !comment.value.includes('#DOCMAP_v0.0.1:');
                });
            }
            if (nodePath.node.trailingComments) {
              nodePath.node.trailingComments =
                nodePath.node.trailingComments.filter((comment) => {
                  !comment.value.includes('#DOCMAP_v0.0.1:');
                });
            }
          },
        });
      },
    };

    traverse(ast, visitor);

    const { code: modifiedCode } = generate(ast, {}, code);
    this.writeOutputFile(filePath, modifiedCode);
  }

  traverseDirectory(dir) {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      const filePath = path.join(dir, file);
      if (file === 'node_modules') {
        return;
      }
      if (fs.statSync(filePath).isDirectory()) {
        this.traverseDirectory(filePath);
      } else if (
        path.extname(filePath) === '.jsx' ||
        path.extname(filePath) === '.tsx' ||
        path.extname(filePath) === '.js' ||
        path.extname(filePath) === '.ts'
      ) {
        this.processFile(filePath);
      }
    });
  }

  writeOutputFile(filePath, modifiedCode) {
    const outputFilePath = path.join(
      this.outputDir,
      path.relative(this.sourceDir, filePath)
    );

    const outputDirPath = path.dirname(outputFilePath);
    this.ensureDirectoryExists(outputDirPath);

    fs.writeFileSync(outputFilePath, modifiedCode);
    console.log(`Processed: ${filePath}`);
  }

  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  writeCollectedComments(readmeFilePath) {
    const commentsContent = collectedComments.join('\n\n');
    fs.writeFileSync(readmeFilePath, commentsContent);
    console.log(`Comments written to ${readmeFilePath}`);
  }
}

const fileProcessor = new FileProcessor(sourceCodeDir, outputCodeDir);
fileProcessor.traverseDirectory(sourceCodeDir);
fileProcessor.writeCollectedComments(readmeFilePath);
