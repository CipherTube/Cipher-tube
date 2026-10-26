/* eslint-disable @typescript-eslint/no-explicit-any */
import { LedgerConsensusGovernor, CipherTubeGovernanceGovernor, governance } from '../src/governance/governor';

describe('Governance and Ledger Consensus Input Hardening', () => {
  describe('LedgerConsensusGovernor.verifyTransition', () => {
    it('should throw error when transition is null or undefined', async () => {
      await expect(LedgerConsensusGovernor.verifyTransition(null as any, [])).rejects.toThrow(
        "LedgerConsensus: Invalid transition. Must be a non-null object."
      );
      await expect(LedgerConsensusGovernor.verifyTransition(undefined as any, [])).rejects.toThrow(
        "LedgerConsensus: Invalid transition. Must be a non-null object."
      );
    });

    it('should throw error when transition is an array or primitive', async () => {
      await expect(LedgerConsensusGovernor.verifyTransition([] as any, [])).rejects.toThrow(
        "LedgerConsensus: Invalid transition. Must be a non-null object."
      );
      await expect(LedgerConsensusGovernor.verifyTransition('string-transition' as any, [])).rejects.toThrow(
        "LedgerConsensus: Invalid transition. Must be a non-null object."
      );
    });

    it('should throw error when transition has missing or non-string ID', async () => {
      await expect(LedgerConsensusGovernor.verifyTransition({} as any, [])).rejects.toThrow(
        "LedgerConsensus: Invalid transition ID."
      );
      await expect(LedgerConsensusGovernor.verifyTransition({ id: 123 } as any, [])).rejects.toThrow(
        "LedgerConsensus: Invalid transition ID."
      );
      await expect(LedgerConsensusGovernor.verifyTransition({ id: '   ' } as any, [])).rejects.toThrow(
        "LedgerConsensus: Invalid transition ID."
      );
    });

    it('should throw error when signatures is not an array', async () => {
      const validTransition = { id: 'tx-001' };
      await expect(LedgerConsensusGovernor.verifyTransition(validTransition, null as any)).rejects.toThrow(
        "LedgerConsensus: Signatures must be an array of strings."
      );
      await expect(LedgerConsensusGovernor.verifyTransition(validTransition, 'not-an-array' as any)).rejects.toThrow(
        "LedgerConsensus: Signatures must be an array of strings."
      );
    });

    it('should throw error when signature elements are not strings', async () => {
      const validTransition = { id: 'tx-001' };
      await expect(LedgerConsensusGovernor.verifyTransition(validTransition, ['sig1', 123 as any])).rejects.toThrow(
        "LedgerConsensus: All signatures must be strings."
      );
    });

    it('should correctly verify valid transition with sufficient signatures', async () => {
      const validTransition = { id: 'tx-001' };
      const validSigs = ['sig1', 'sig2', 'sig3'];
      const result = await LedgerConsensusGovernor.verifyTransition(validTransition, validSigs);

      expect(result.transitionId).toBe('tx-001');
      expect(result.verified).toBe(true);
      expect(result.rootHash).toBeDefined();
    });
  });

  describe('CipherTubeGovernanceGovernor', () => {
    it('should throw error when proposal is null or undefined', async () => {
      await expect(CipherTubeGovernanceGovernor.submitProposal(null as any)).rejects.toThrow(
        "Governance: Invalid proposal. Must be a non-null object."
      );
    });

    it('should throw error when proposal is an array or primitive', async () => {
      await expect(CipherTubeGovernanceGovernor.submitProposal([] as any)).rejects.toThrow(
        "Governance: Invalid proposal. Must be a non-null object."
      );
    });

    it('should throw error when proposal lacks a valid title', async () => {
      await expect(CipherTubeGovernanceGovernor.submitProposal({} as any)).rejects.toThrow(
        "Governance: Proposal must have a valid non-empty title."
      );
      await expect(CipherTubeGovernanceGovernor.submitProposal({ title: 123 } as any)).rejects.toThrow(
        "Governance: Proposal must have a valid non-empty title."
      );
      await expect(CipherTubeGovernanceGovernor.submitProposal({ title: '   ' } as any)).rejects.toThrow(
        "Governance: Proposal must have a valid non-empty title."
      );
    });

    it('should correctly submit valid proposal', async () => {
      const prop = await CipherTubeGovernanceGovernor.submitProposal({ title: 'Improve Security' });
      expect(prop.title).toBe('Improve Security');
      expect(prop.id).toBeDefined();
      expect(prop.status).toBe('PENDING_CONSENSUS');

      const list = await CipherTubeGovernanceGovernor.listProposals();
      expect(list.some(p => p.id === prop.id)).toBe(true);
    });

    it('should throw error when enforcing with invalid proposalId', async () => {
      await expect(CipherTubeGovernanceGovernor.enforce(null as any)).rejects.toThrow(
        "Governance: Invalid proposal ID."
      );
      await expect(CipherTubeGovernanceGovernor.enforce('   ')).rejects.toThrow(
        "Governance: Invalid proposal ID."
      );
    });

    it('should enforce a valid submitted proposal', async () => {
      const prop = await CipherTubeGovernanceGovernor.submitProposal({ title: 'Enforce Defense In Depth' });
      const enforceRes = await CipherTubeGovernanceGovernor.enforce(prop.id);

      expect(enforceRes.status).toBe('STABLE');
      expect(enforceRes.proposalId).toBe(prop.id);
    });
  });

  describe('governance action stubs', () => {
    it('submit stub should throw if params is missing', async () => {
      await expect(governance.submit(null as any)).rejects.toThrow(
        "Governance: Missing parameters for submit."
      );
    });

    it('enforce stub should throw if params or id is missing/invalid', async () => {
      await expect(governance.enforce(null as any)).rejects.toThrow(
        "Governance: Missing or invalid proposal ID for enforce."
      );
      await expect(governance.enforce({} as any)).rejects.toThrow(
        "Governance: Missing or invalid proposal ID for enforce."
      );
      await expect(governance.enforce({ id: 123 } as any)).rejects.toThrow(
        "Governance: Missing or invalid proposal ID for enforce."
      );
    });

    it('verify_ledger stub should throw if params is missing', async () => {
      await expect(governance.verify_ledger(null as any)).rejects.toThrow(
        "LedgerConsensus: Missing parameters for verify_ledger."
      );
    });
  });
});
