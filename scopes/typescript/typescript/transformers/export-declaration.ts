import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import {
  ModuleSchema,
  UnresolvedSchema,
  UnImplementedSchema,
  ExportSchema,
} from '@teambit/semantics.entities.semantic-schema';
import type {
  Node,
  ExportDeclaration as ExportDeclarationNode,
  NamedExports,
  NamespaceExport,
  ExportSpecifier,
} from 'typescript';
import ts, { SyntaxKind } from 'typescript';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';

export class ExportDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.ExportDeclaration;
  }

  async getIdentifiers(exportDec: ExportDeclarationNode, context: SchemaExtractorContext) {
    // e.g. `export { button1, button2 } as Composition from './button';
    const rawSourceFilePath = exportDec.moduleSpecifier?.getText();

    // strip off quotes ''
    const sourceFilePath = rawSourceFilePath && rawSourceFilePath.substring(1, rawSourceFilePath?.length - 1);

    if (exportDec.exportClause?.kind === ts.SyntaxKind.NamedExports) {
      return exportDec.exportClause.elements.map((elm) => {
        const alias = (elm.propertyName && elm.name.getText()) || undefined;
        const id = elm.propertyName?.getText() || elm.name.getText();
        const fileName = elm.getSourceFile().fileName;

        return new ExportIdentifier(id, fileName, alias, sourceFilePath);
      });
    }

    //  e.g. `export * as Composition from './button';
    if (exportDec.exportClause?.kind === ts.SyntaxKind.NamespaceExport) {
      return [
        new ExportIdentifier(
          exportDec.exportClause.name.getText(),
          exportDec.getSourceFile().fileName,
          undefined,
          sourceFilePath
        ),
      ];
    }

    if (exportDec.moduleSpecifier) {
      return context.getFileExports(exportDec);
    }

    return [];
  }

  async transform(exportDec: ExportDeclarationNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const exportClause = exportDec.exportClause;

    // it's export-all, e.g. `export * from './button'`;
    if (!exportClause) {
      const specifier = exportDec.moduleSpecifier;
      if (!specifier) {
        throw new Error(`fatal: no specifier`);
      }
      const sourceFile = await context.getSourceFileFromNode(specifier);
      // export * from 'webpack', export-all from a package
      if (!sourceFile) {
        return new UnImplementedSchema(
          context.getLocation(exportDec),
          exportDec.getText(),
          SyntaxKind[SyntaxKind.ExportDeclaration]
        );
      }
      return context.computeSchema(sourceFile);
    }

    // e.g. `export { button1, button2 } as Composition from './button';
    if (exportClause.kind === SyntaxKind.NamedExports) {
      const schemas = await namedExport(exportClause, context);
      return new ModuleSchema(context.getLocation(exportDec), schemas, []);
    }
    // e.g. `export * as Composition from './button';
    if (exportClause.kind === SyntaxKind.NamespaceExport) {
      return namespaceExport(exportClause, exportDec, context);
    }

    // should never reach here. exportClause can be either NamespaceExport or NamedExports
    throw new Error(`unrecognized exportClause type`);
  }
}

function isSameNode(nodeA: Node, nodeB: Node): boolean {
  return nodeA.kind === nodeB.kind && nodeA.pos === nodeB.pos && nodeA.end === nodeB.end;
}

async function namedExport(exportClause: NamedExports, context: SchemaExtractorContext): Promise<ExportSchema[]> {
  const schemas = await Promise.all(
    exportClause.elements.map(async (element) => {
      return exportSpecifierToSchemaNode(element, context);
    })
  );

  return schemas;
}

async function exportSpecifierToSchemaNode(
  element: ExportSpecifier,
  context: SchemaExtractorContext
): Promise<ExportSchema> {
  try {
    const name = element.propertyName?.getText() || element.name.getText();
    const alias = element.propertyName ? element.name.getText() : undefined;
    const location = context.getLocation(element.name);
    const definitionInfo = element.isTypeOnly
      ? await context.definitionInfo(element.name)
      : await context.definitionInfo(element);

    if (!definitionInfo) {
      const exportNode = new UnresolvedSchema(location, element.name.getText());
      // happens for example when the main index.ts file exports variable from an mdx file.
      // tsserver is unable to get the definition node because it doesn't know to parse mdx files.
      // return new UnresolvedSchema(context.getLocation(element.name), element.name.getText());
      return new ExportSchema(location, name, exportNode, alias);
    }

    const definitionNode = await context.definition(definitionInfo);

    if (!definitionNode) {
      const exportNode = await context.resolveType(element, name);
      return new ExportSchema(location, name, exportNode, alias);
    }

    // if it is reexported from another export
    if (isSameNode(element, definitionNode.parent)) {
      // the definition node is the same node as element.name. tsserver wasn't able to find the source for it
      // normally, "bit install" should fix it. another option is to open vscode and look for errors.
      throw new Error(`error: tsserver is unable to locate the identifier "${element.name.getText()}" at ${context.getLocationAsString(
        element.name
      )}.
make sure "bit status" is clean and there are no errors about missing packages/links.
also, make sure the tsconfig.json in the root has the "jsx" setting defined.`);
    }

    if (definitionNode.parent.kind === SyntaxKind.ExportSpecifier) {
      return await exportSpecifierToSchemaNode(definitionNode.parent as ExportSpecifier, context);
    }

    const exportNode = await context.computeSchema(definitionNode.parent);
    return new ExportSchema(location, name, exportNode, alias);
  } catch {
    const exportNode = new UnresolvedSchema(context.getLocation(element.name), element.name.getText());
    return new ExportSchema(context.getLocation(element.name), element.name.getText(), exportNode);
  }
}

async function namespaceExport(
  exportClause: NamespaceExport,
  exportDec: ExportDeclarationNode,
  context: SchemaExtractorContext
) {
  const namespace = exportClause.name.getText();
  const filePath = await context.getFilePathByNode(exportClause.name);
  if (!filePath) {
    throw new Error(`unable to find the file-path for "${namespace}"`);
  }
  const sourceFile = context.getSourceFileInsideComponent(filePath);
  if (!sourceFile) {
    // it's a namespace from another component or an external package.
    return context.getTypeRefForExternalPath(namespace, filePath, context.getLocation(exportDec));
  }
  const result = await context.computeSchema(sourceFile);
  if (!(result instanceof ModuleSchema)) {
    throw new Error(`expect result to be instance of Module`);
  }
  result.namespace = namespace;
  return result;
}
