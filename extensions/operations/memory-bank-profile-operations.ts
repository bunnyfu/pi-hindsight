import { resolveOperationBank } from "../banks/bank-selection.js";
import type { MemoryOperationsDeps } from "./memory-operation-types.js";
import type {
  AddBankBackgroundRequest,
  DispositionTraits,
  UpdateBankProfileRequest,
} from "../types.js";

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

function validateDisposition(disposition: DispositionTraits): void {
  for (const [key, value] of Object.entries(disposition)) {
    if (!Number.isInteger(value) || value < 1 || value > 5)
      throw new Error(`Disposition ${key} must be an integer from 1 to 5.`);
  }
}

function hasProfileUpdates(request: UpdateBankProfileRequest): boolean {
  return Object.values(request).some((value) => value !== undefined);
}

export function createBankProfileOperations(deps: MemoryOperationsDeps) {
  return {
    async getBankProfile(args: { bank?: string } = {}) {
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.getBankProfile) throw unsupported("getBankProfile");
      const result = await client.getBankProfile(bankId);
      return { bankId, result };
    },

    async updateBankProfile(args: {
      bank?: string;
      request: UpdateBankProfileRequest;
      confirm: true;
    }) {
      if (!args.confirm) throw new Error("Set confirm=true to update Hindsight bank profile.");
      if (!hasProfileUpdates(args.request))
        throw new Error("At least one profile field is required.");
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.updateBankProfile) throw unsupported("updateBankProfile");
      const before = client.getBankProfile ? await client.getBankProfile(bankId) : undefined;
      const result = await client.updateBankProfile(bankId, args.request);
      return { bankId, before, result };
    },

    async updateBankDisposition(args: {
      bank?: string;
      disposition: DispositionTraits;
      confirm: true;
    }) {
      if (!args.confirm) throw new Error("Set confirm=true to update Hindsight bank disposition.");
      validateDisposition(args.disposition);
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.updateBankDisposition) throw unsupported("updateBankDisposition");
      const before = client.getBankProfile ? await client.getBankProfile(bankId) : undefined;
      const result = await client.updateBankDisposition(bankId, args.disposition);
      return { bankId, before, result };
    },

    async addBankBackground(args: {
      bank?: string;
      request: AddBankBackgroundRequest;
      confirm: true;
    }) {
      if (!args.confirm) throw new Error("Set confirm=true to append Hindsight bank background.");
      if (!args.request.content.trim()) throw new Error("Background content is required.");
      const bankId = bankFor(deps, args.bank);
      const client = deps.getClient();
      if (!client.addBankBackground) throw unsupported("addBankBackground");
      const before = client.getBankProfile ? await client.getBankProfile(bankId) : undefined;
      const result = await client.addBankBackground(bankId, args.request);
      return { bankId, before, result };
    },
  };
}
