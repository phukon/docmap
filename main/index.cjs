/**
 * Trailing comments are only assigned to the code that is on the same line as themselves.
 * Leading comments that are block quotes are assigned to the code that is directly below them.
 *
 * The lines in babel ast world are ONE indexed, and the columns are ZERO indexed.
 * In sourcemap world. Everything is zero indexed (lines and columns)
 * A semicolon (;) means skip to next line in the output file.
 */

// **Interpreting the mappings entries (Base 64 VLQ)**
// - [0]: Column index in the compiled file
// - [1]: What original source file the location in the compiled source maps to
// - [2]: Row index in the original source file (i.e. the line number)
// - [3]: Column index in the original source file
const prettier = require('prettier');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
// const types = require('@babel/types');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { SourceMapGenerator } = require('source-map');
const sourceCodeDir = './test';
const readmeFilePath = './README.md';
const sourceMapFilePath = './README.map.json';
let collectedComments = [];
let commentLocations = [];

const defaultPrettierConfig = {
  semi: true,
  singleQuote: false,
  trailingComma: 'es5',
};

async function formatWithPrettier(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const resolvedConfig = await prettier.resolveConfig(filePath);
  const options = resolvedConfig
    ? { ...resolvedConfig, filepath: filePath }
    : { ...defaultPrettierConfig, filepath: filePath };
  const formatted = await prettier.format(code, options);
  fs.writeFileSync(filePath, formatted);
}

async function formatDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (file === 'node_modules') {
      continue;
    }
    if (fs.statSync(filePath).isDirectory()) {
      await formatDirectory(filePath);
    } else if (
      ['.jsx', '.tsx', '.js', '.ts'].includes(path.extname(filePath))
    ) {
      await formatWithPrettier(filePath);
    }
  }
}

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

    ast.comments.forEach((comment) => {
      comment._docmapId = uuidv4();
    });

    // TO DEBUG AST
    // const astJson = JSON.stringify(ast, null, 2);
    // const astJsonFilePath = filePath + '.ast.json';
    // fs.writeFileSync(astJsonFilePath, astJson);

    ast.comments = ast.comments.filter((comment) => {
      const isTargetComment = comment.value.includes('#DOCMAP_v0.0.1:');
      if (isTargetComment) {
        /**
         * Extracts all content following the #DOCMAP_v0.0.1: tag and removes any leading asterisks.
         * It first isolates the content after the specified tag, then splits it into individual lines for processing.
         * Each line is cleaned by removing any leading asterisks (*) and spaces. Finally, the cleaned lines are
         * rejoined, with newline characters preserved, to maintain the original formatting.
         */

        const cleanedComment = comment.value
          .substring(
            comment.value.indexOf('#DOCMAP_v0.0.1:') + '#DOCMAP_v0.0.1:'.length
          )
          .split('\n') // Split by newline to process each line
          .map((line) => line.replace(/^ \* /, '')) // Remove leading asterisk and spaces for each line
          .join('\n') // Rejoin the lines with newline characters preserved
          .trim();

        collectedComments.push({
          docmapId: comment._docmapId,
          text: cleanedComment,
          isMultiline: comment.type === 'CommentBlock',
        });
      }
      return !isTargetComment;
    });

    const visitor = {
      Program: (path) => {
        path.traverse({
          enter: (nodePath) => {
            if (nodePath.node.leadingComments) {
              nodePath.node.leadingComments =
                nodePath.node.leadingComments.filter((comment) => {
                  if (
                    comment.type === 'CommentBlock' &&
                    comment.value.includes('#DOCMAP_v0.0.1:')
                  ) {
                    const location = nodePath.node.loc.start;
                    const currentId = comment._docmapId;
                    const hasBlankLineBefore = this.checkBlankLineBefore(comment, code);
                    commentLocations.push({
                      docmapId: currentId,
                      filePath,
                      loc: location,
                      hasBlankLineBefore,
                    });
                    // we are doing this again because a comment can be a leading comment for one node and trailing comment for another
                    path.traverse({
                      enter(innerPath) {
                        if (innerPath.node.leadingComments) {
                          innerPath.node.leadingComments =
                            innerPath.node.leadingComments.filter(
                              (innerComment) =>
                                innerComment._docmapId !== currentId
                            );
                        }
                        if (innerPath.node.trailingComments) {
                          innerPath.node.trailingComments =
                            innerPath.node.trailingComments.filter(
                              (innerComment) =>
                                innerComment._docmapId !== currentId
                            );
                        }
                      },
                    });
                    return false;
                  }
                  return true;
                });
            }
            if (nodePath.node.trailingComments) {
              nodePath.node.trailingComments =
                nodePath.node.trailingComments.filter((comment) => {
                  if (comment.value.includes('#DOCMAP_v0.0.1:')) {
                    const location = nodePath.node.loc.start;
                    const endLine = nodePath.node.loc.end.line;
                    if (comment.loc.start.line === endLine) {
                      const currentId = comment._docmapId;
                      commentLocations.push({
                        docmapId: currentId,
                        filePath,
                        loc: location,
                      });
                      path.traverse({
                        enter(innerPath) {
                          if (innerPath.node.leadingComments) {
                            innerPath.node.leadingComments =
                              innerPath.node.leadingComments.filter(
                                (innerComment) =>
                                  innerComment._docmapId !== currentId
                              );
                          }
                          if (innerPath.node.trailingComments) {
                            innerPath.node.trailingComments =
                              innerPath.node.trailingComments.filter(
                                (innerComment) =>
                                  innerComment._docmapId !== currentId
                              );
                          }
                        },
                      });
                      return false;
                    }
                  }
                  return true;
                });
            }
          },
        });
      },
    };

    traverse(ast, visitor);

    const { code: modifiedCode } = generate(ast, { retainLines: true }, code);
    this.writeOutputFile(filePath, modifiedCode);
  }

  /**
   * We are doing this because
   * - If a comment block is sandwiched between two code snippets without blank lines,
   *   it becomes a single blank line after the codemod.
   * 
   * - If there are blank lines before the comment, they're consolidated
   *   into one blank line after applygin the formatter.
   */
  checkBlankLineBefore(comment, sourceCode) {
    const lines = sourceCode.split('\n');
    const commentStartLine = comment.loc.start.line;
    if (commentStartLine > 1) {
      const previousLine = lines[commentStartLine - 2]; // -2 because array is 0-indexed and we want the line before the comment
      return previousLine.trim() === '';
    }
    return false;
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
    const filteredComments = collectedComments.filter((comment) =>
      commentLocations.some(
        (location) => location.docmapId === comment.docmapId
      )
    );
    const commentsContent = filteredComments
      .map((item) => item.text)
      .join('\n\n');
    fs.writeFileSync(readmeFilePath, commentsContent);
    console.log(`Comments written to ${readmeFilePath}`);
  }

  generateSourceMap(sourceMapFilePath) {
    const map = new SourceMapGenerator({ file: readmeFilePath });
    let line = 1;
    let offset = 0;
    collectedComments.forEach((comment) => {
      const location = commentLocations.find(
        (loc) => loc.docmapId === comment.docmapId
      );
      if (location) {
        // Increase offset by 1 if there's a blank line before the comment
        if (location.hasBlankLineBefore) {
          offset += 1;
        }

        const lines = comment.text.split('\n');
        if (lines.length > 1) {
          offset += lines.length + 3; // the starting chars + the tag +  the ending chars = 3
        } else if (lines.length === 1 && comment.isMultiline) { // Inline comments and Comment blocks can still have one line after parsing
          offset += 3;
        }
        lines.forEach((_, i) => {
          let mapping = {
            generated: { line: line + i, column: 0 },
            source: location.filePath,
            original: { line: location.loc.line - offset, column: 0 },
            name: null,
          };
          map.addMapping(mapping);
          // TO DEBUG AST
          // console.log('Added mapping:', {
          //   without_offset: location.loc.line,
          //   offset: offset,
          //   generated: mapping.generated,
          //   source: mapping.source,
          //   original: mapping.original,
          //   name: mapping.name,
          // });
        });
        line += lines.length + 1; // +1 for the blank line between comments
        const sourceContent = fs.readFileSync(location.filePath, 'utf-8');
        map.setSourceContent(location.filePath, sourceContent);
      }
    });

    fs.writeFileSync(sourceMapFilePath, map.toString());
    console.log(`Source map written to ${sourceMapFilePath}`);
  }
}

(async () => {
  console.log('Running Prettier Formatter...');
  await formatDirectory(sourceCodeDir);
  console.log('Running Codemod...');
  const fileProcessor = new FileProcessor(sourceCodeDir, sourceCodeDir);
  fileProcessor.traverseDirectory(sourceCodeDir);
  fileProcessor.writeCollectedComments(readmeFilePath);
  fileProcessor.generateSourceMap(sourceMapFilePath);

  console.log('Running Prettier Formatter After Codemod...');
  await formatDirectory(sourceCodeDir);
})();
