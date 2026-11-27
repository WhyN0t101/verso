import {describe, expect, it, vi} from 'vitest';
import {createCardSlot} from '../src/ui/cardSlot';

const urls = () => {
  let n = 0;
  return {createObjectURL: vi.fn(() => `blob:${++n}`), revokeObjectURL: vi.fn()};
};

describe('card slot', () => {
  it('serves the new image and frees the previous URL', () => {
    const u = urls();
    const slot = createCardSlot(u);
    const a = new Blob(['a']);
    const b = new Blob(['b']);
    expect(slot.set(a)).toBe('blob:1');
    expect(slot.set(b)).toBe('blob:2');
    expect(slot.blob).toBe(b);
    expect(u.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });

  it('has nothing to download once cleared, so a failed or pending render cannot save the old card', () => {
    const u = urls();
    const slot = createCardSlot(u);
    slot.set(new Blob(['old']));
    slot.clear();
    expect(slot.blob).toBeNull();
    expect(u.revokeObjectURL).toHaveBeenCalledWith('blob:1');
    slot.clear();
    expect(u.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
