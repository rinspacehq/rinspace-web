import { contentDeletionCommand, contentDeletionStepUpHeader } from './contentDeletion';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toEqual(expected: unknown): void;
};

test('content deletion command satisfies the server confirmation contract', () => {
  expect(contentDeletionCommand(' draft-42 ', 'delete-draft-42')).toEqual({
    confirmation: 'DELETE draft-42',
    idempotencyKey: 'delete-draft-42',
  });
});

test('content deletion sends only a normalized action-bound proof', () => {
  expect(contentDeletionStepUpHeader('  rin_su_proof  ')).toEqual({
    'X-Rinspace-Step-Up': 'rin_su_proof',
  });
  expect(contentDeletionStepUpHeader()).toEqual({});
});
