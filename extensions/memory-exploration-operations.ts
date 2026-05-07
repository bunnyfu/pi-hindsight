import { resolveOperationBank } from "./bank-selection.js";
import type { MemoryOperationsDeps } from "./memory-operation-types.js";
import type {
  GetEntityGraphOptions,
  GetGraphOptions,
  ListDocumentsOptions,
  ListEntitiesOptions,
  ListTagsOptions,
  UpdateDocumentRequest,
} from "./types.js";

function unsupported(name: string): Error {
  return new Error(`Hindsight client does not support ${name}.`);
}

function bankFor(deps: MemoryOperationsDeps, bank: string | undefined): string {
  return resolveOperationBank({
    requestedBank: bank,
    config: deps.getConfig(),
    projectBankId: deps.getProjectBankId(),
  });
}

export function createExplorationOperations(deps: MemoryOperationsDeps) {
  return {
    async listDocuments(args: { bank?: string; options?: ListDocumentsOptions }) {
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.listDocuments) throw unsupported("listDocuments");
      const result = await client.listDocuments(bankId, args.options);
      return { bankId, result };
    },

    async getDocument(args: { bank?: string; documentId: string }) {
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.getDocument) throw unsupported("getDocument");
      const result = await client.getDocument(bankId, args.documentId);
      return { bankId, documentId: args.documentId, result };
    },

    async updateDocumentTags(args: {
      bank?: string;
      documentId: string;
      request: UpdateDocumentRequest;
      confirm: true;
    }) {
      if (!args.confirm) throw new Error("Set confirm=true to update Hindsight document tags.");
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.updateDocument) throw unsupported("updateDocument");
      const result = await client.updateDocument(bankId, args.documentId, args.request);
      return { bankId, documentId: args.documentId, result };
    },

    async listEntities(args: { bank?: string; options?: ListEntitiesOptions }) {
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.listEntities) throw unsupported("listEntities");
      const result = await client.listEntities(bankId, args.options);
      return { bankId, result };
    },

    async getEntity(args: { bank?: string; entityId: string }) {
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.getEntity) throw unsupported("getEntity");
      const result = await client.getEntity(bankId, args.entityId);
      return { bankId, entityId: args.entityId, result };
    },

    async regenerateEntity(args: { bank?: string; entityId: string; confirm: true }) {
      if (!args.confirm)
        throw new Error("Set confirm=true to regenerate Hindsight entity observations.");
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.regenerateEntity) throw unsupported("regenerateEntity");
      const result = await client.regenerateEntity(bankId, args.entityId);
      return { bankId, entityId: args.entityId, result };
    },

    async getGraph(args: { bank?: string; options?: GetGraphOptions }) {
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.getGraph) throw unsupported("getGraph");
      const result = await client.getGraph(bankId, args.options);
      return { bankId, result };
    },

    async getEntityGraph(args: { bank?: string; options?: GetEntityGraphOptions }) {
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.getEntityGraph) throw unsupported("getEntityGraph");
      const result = await client.getEntityGraph(bankId, args.options);
      return { bankId, result };
    },

    async listTags(args: { bank?: string; options?: ListTagsOptions }) {
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.listTags) throw unsupported("listTags");
      const result = await client.listTags(bankId, args.options);
      return { bankId, result };
    },
  };
}
