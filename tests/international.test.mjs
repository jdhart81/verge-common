import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toMinor,
  formatMoney,
  areaToSquareMetres,
} from '../lib/international.mjs';
import { newWorkspace, applyCommand } from '../lib/network.mjs';
test('currency conversion preserves zero, two and three decimal minor units', () => {
  assert.equal(toMinor('1234', 'JPY'), 1234);
  assert.equal(toMinor('12.34', 'EUR'), 1234);
  assert.equal(toMinor('1.234', 'KWD'), 1234);
  assert.throws(() => toMinor('1.2', 'JPY'));
  assert.throws(() => toMinor('1.234', 'EUR'));
  assert.throws(() => toMinor('9007199254740992', 'EUR'));
  assert.match(formatMoney(1234, 'KWD'), /1\.234/);
});
test('regional settings retain legacy currency and lock after financial records', () => {
  const user = { id: 'test' },
    input = {
      name: 'Commons',
      region: 'Kisumu',
      summary: 'Test only',
      displayName: 'Steward',
      country: 'Kenya',
      currency: 'KES',
    };
  const s = newWorkspace(input, user, 1, 'coop');
  assert.equal(s.currency, 'KES');
  assert.throws(() =>
    newWorkspace({ ...input, currency: 'BAD' }, user, 1, 'coop'),
  );
  s.settlements.push({ currency: 'KES' });
  assert.throws(
    () =>
      applyCommand(
        s,
        user,
        {
          op: 'update_regional_settings',
          payload: { country: 'Kenya', currency: 'USD' },
        },
        2,
        'event',
      ),
    /locked/,
  );
});
test('area input converts documented units without accepting invalid area', () => {
  assert.equal(areaToSquareMetres(2, 'hectares'), 20000);
  assert.equal(areaToSquareMetres(1, 'acres'), 4047);
  assert.throws(() => areaToSquareMetres(-1, 'hectares'));
  assert.throws(() => areaToSquareMetres(1, 'unknown'));
});
