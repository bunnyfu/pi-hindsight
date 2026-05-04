import { resolveOperationBank } from "./bank-selection.js";
import type { MemoryOperationsDeps } from "./memory-operation-types.js";
import type {
  CreateMentalModelRequest,
  GetMentalModelOptions,
  ListMentalModelsOptions,
  UpdateMentalModelRequest,
} from "./types.js";

function resolveBank(deps: MemoryOperationsDeps, requestedBank: string | undefined): string {
  return resolveOperationBank({
    requestedBank,
    config: deps.getConfig(),
    projectBankId: deps.getProjectBankId(),
  });
}

function unavailable(name: string): Error {
  return new Error(`Hindsight mental model ${name} is unavailable in this client`);
}

export function createMentalModelOperations(deps: MemoryOperationsDeps) {
  return {
    async listMentalModels(args: { bank?: string; options?: ListMentalModelsOptions } = {}) {
      const bankId = resolveBank(deps, args.bank);
      const client = deps.getClient();
      if (!client.listMentalModels) throw unavailable("list");
      const result = await client.listMentalModels(bankId, args.options);
      return { bankId, result };
    },

    async getMentalModel(args: {
      bank?: string;
      mentalModelId: string;
      options?: GetMentalModelOptions;
    }) {
      const bankId = resolveBank(deps, args.bank);
      const client = deps.getClient();
      if (!client.getMentalModel) throw unavailable("get");
      const result = await client.getMentalModel(bankId, args.mentalModelId, args.options);
      return { bankId, mentalModelId: args.mentalModelId, result };
    },

    async createMentalModel(args: { bank?: string; request: CreateMentalModelRequest }) {
      const bankId = resolveBank(deps, args.bank);
      const client = deps.getClient();
      if (!client.createMentalModel) throw unavailable("create");
      const result = await client.createMentalModel(bankId, args.request);
      return { bankId, result };
    },

    async updateMentalModel(args: {
      bank?: string;
      mentalModelId: string;
      request: UpdateMentalModelRequest;
    }) {
      const bankId = resolveBank(deps, args.bank);
      const client = deps.getClient();
      if (!client.updateMentalModel) throw unavailable("update");
      const result = await client.updateMentalModel(bankId, args.mentalModelId, args.request);
      return { bankId, mentalModelId: args.mentalModelId, result };
    },

    async deleteMentalModel(args: { bank?: string; mentalModelId: string }) {
      const bankId = resolveBank(deps, args.bank);
      const client = deps.getClient();
      if (!client.deleteMentalModel) throw unavailable("delete");
      const result = await client.deleteMentalModel(bankId, args.mentalModelId);
      return { bankId, mentalModelId: args.mentalModelId, result };
    },

    async getMentalModelHistory(args: { bank?: string; mentalModelId: string }) {
      const bankId = resolveBank(deps, args.bank);
      const client = deps.getClient();
      if (!client.getMentalModelHistory) throw unavailable("history");
      const result = await client.getMentalModelHistory(bankId, args.mentalModelId);
      return { bankId, mentalModelId: args.mentalModelId, result };
    },

    async refreshMentalModel(args: { bank?: string; mentalModelId: string }) {
      const bankId = resolveBank(deps, args.bank);
      const client = deps.getClient();
      if (!client.refreshMentalModel) throw unavailable("refresh");
      const result = await client.refreshMentalModel(bankId, args.mentalModelId);
      return { bankId, mentalModelId: args.mentalModelId, result };
    },
  };
}
