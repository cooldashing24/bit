import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { ModuleSchema } from '@teambit/semantics.entities.semantic-schema';
import { compact } from 'lodash';
import pMapSeries from 'p-map-series';
import type { Node, VariableStatement } from 'typescript';
import ts from 'typescript';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

/**
 * variable statement is a collection of variable declarations.
 * e.g. `export const a = 1, b = () => {}, c = {};`
 */
export class VariableStatementTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.VariableStatement;
  }

  async getIdentifiers(node: VariableStatement) {
    return node.declarationList.declarations.map((dec) => {
      return new Identifier(dec.name.getText(), dec.getSourceFile().fileName);
    });
  }

  async transform(node: VariableStatement, context: SchemaExtractorContext): Promise<SchemaNode> {
    const schemas = await pMapSeries(node.declarationList.declarations, async (dec) => {
      // this will get the schema from variable-declaration
      const schema = await context.visitDefinition(dec.name);
      return schema;
    });
    return new ModuleSchema(context.getLocation(node), compact(schemas), []);
  }
}
