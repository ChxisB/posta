import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Reel } from './reel';
import { DeliveryReel } from '@/components/reels/delivery-reel';

/**
 * The reel's visible behaviour is easy to eyeball. What is not is whether it
 * still runs timers in a background tab, and whether it conveys anything at
 * all to someone who has asked for reduced motion — both of which fail
 * silently and neither of which anyone notices in review.
 */

function stubMotionPreference(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  );
}

/** IntersectionObserver that reports whatever visibility we ask for. */
function stubVisibility(visible: boolean) {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private cb: (entries: Array<{ isIntersecting: boolean }>) => void) {}
      observe() {
        this.cb([{ isIntersecting: visible }]);
      }
      disconnect() {}
      unobserve() {}
    },
  );
}

const STEPS = ['one', 'two', 'three'];

const subject = () =>
  render(
    <Reel
      label="A three-step sequence"
      timings={[100, 100, 100]}
      render={(step) => <span>{STEPS[step]}</span>}
    />,
  );

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Reel', () => {
  it('exposes one labelled image rather than a pile of animating nodes', () => {
    stubMotionPreference(false);
    stubVisibility(true);
    subject();
    // Assistive tech should hear one description of the sequence, not each
    // frame as it changes.
    expect(screen.getByRole('img', { name: 'A three-step sequence' })).toBeInTheDocument();
  });

  it('advances while on screen', async () => {
    vi.useFakeTimers();
    stubMotionPreference(false);
    stubVisibility(true);
    subject();

    expect(screen.getByText('one')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.getByText('two')).toBeInTheDocument();
  });

  it('holds the opening frame while off screen', async () => {
    // A page with several reels should not run several timers against a tab
    // nobody is looking at.
    vi.useFakeTimers();
    stubMotionPreference(false);
    stubVisibility(false);
    subject();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('one')).toBeInTheDocument();
  });

  it('holds the final frame under reduced motion', async () => {
    // Not the first frame: the last one carries the outcome, so the
    // information survives even with the movement removed.
    vi.useFakeTimers();
    stubMotionPreference(true);
    stubVisibility(true);
    subject();

    expect(screen.getByText('three')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('three')).toBeInTheDocument();
  });

  it('wraps around rather than stopping at the end', async () => {
    vi.useFakeTimers();
    stubMotionPreference(false);
    stubVisibility(true);
    subject();

    // One step at a time: each timeout is scheduled by an effect after the
    // previous render, so a single large advance fires only the first.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        vi.advanceTimersByTime(120);
      });
    }
    expect(screen.getByText('one')).toBeInTheDocument();
  });
});

describe('DeliveryReel', () => {
  it('narrates the whole sequence, including the final duration', () => {
    // Someone who cannot see the animation should still get the claim the
    // hero is making.
    stubMotionPreference(false);
    stubVisibility(true);
    render(<DeliveryReel />);

    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toContain('94 milliseconds');
    expect(label).toContain('accepted');
  });

  it('shows the outcome immediately under reduced motion', () => {
    stubMotionPreference(true);
    stubVisibility(true);
    render(<DeliveryReel />);
    expect(screen.getByText('250 Accepted')).toBeInTheDocument();
    expect(screen.getByText('94ms total')).toBeInTheDocument();
  });
});
