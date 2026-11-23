import Track from '../../../../js/app/common/audio/Track';
import TrackPlayer from '../../../../js/app/common/audio/TrackPlayer';

const mockHowls = vi.hoisted(() => []);

vi.mock('howler', () => {
  // Fake Howl emulating Howler 2.2.4 fade semantics: a fade can be running,
  // starting a new fade or setting the volume interrupts it and emits `fade`,
  // and events are delivered asynchronously (here: manually via flushEvents).
  class FakeHowl {
    constructor(opts) {
      this.opts = opts;
      this._sprite = {};
      this.vol = 1;
      this.fading = false;
      this.queue = [];
      this.calls = [];
      mockHowls.push(this);
    }

    duration() {
      return 100;
    }

    volume(v) {
      if (v === undefined) return this.vol;
      this.interrupt();
      this.vol = v;
      this.calls.push(['volume', v]);
      return this;
    }

    interrupt() {
      if (this.fading) {
        this.fading = false;
        this.queue.push('fade');
      }
    }

    fade(from, to, len) {
      this.volume(from);
      this.fading = true;
      this.fadeFrom = from;
      this.fadeTo = to;
      this.calls.push(['fade', from, to, len]);
      return this;
    }

    play(sprite) {
      this.calls.push(['play', sprite]);
    }

    stop() {
      this.calls.push(['stop']);
    }

    mute() {}

    on() {}

    // Naturally complete the active fade. Like Howler 2.2.4, a fade whose start
    // and end volumes are equal never completes (no `fade` event).
    finishFade() {
      if (this.fading && this.fadeFrom !== this.fadeTo) {
        this.fading = false;
        this.vol = this.fadeTo;
        this.queue.push('fade');
      }
    }

    // Move the active fade part of the way (the volume changes, the fade keeps running).
    progress(v) {
      this.vol = v;
    }

    // Deliver queued events asynchronously, like Howler's setTimeout(0).
    flushEvents() {
      const events = this.queue.splice(0);
      events.forEach(() => this.opts.onfade());
    }

    count(name) {
      return this.calls.filter(c => c[0] === name).length;
    }
  }

  return { Howl: FakeHowl, Howler: {} };
});

function makeTrack() {
  const track = new Track(['a.mp3'], { onload: () => {} });
  const howl = mockHowls[mockHowls.length - 1];
  howl.opts.onload();
  return { track, howl };
}

beforeEach(() => {
  mockHowls.length = 0;
});

describe('Track fading', () => {
  it('stops after a normal fade out completes', () => {
    const { track, howl } = makeTrack();
    track.play();
    track.fadeOut();
    howl.finishFade();
    howl.flushEvents();

    expect(howl.count('stop')).toBe(1);
    expect(track.fadingState).toBe('none');
  });

  it('keeps fading out when max volume is set during a fade out', () => {
    const { track, howl } = makeTrack();
    track.play();
    track.fadeOut();
    const fadesBefore = howl.count('fade');

    track.setMaxVolume(1.0);

    expect(track.fadingState).toBe('out');
    expect(howl.count('fade')).toBe(fadesBefore);

    howl.finishFade();
    howl.flushEvents();
    expect(howl.count('stop')).toBe(1);
    expect(howl.vol).toBe(0);
  });

  it('reaches stop after inToOut -> out', () => {
    const { track, howl } = makeTrack();
    track.fadeIn();
    howl.progress(0.3); // the fade in is part of the way when the fade out starts
    track.fadeOut();
    expect(track.fadingState).toBe('inToOut');
    expect(howl.fadeFrom).toBe(0.3);

    howl.flushEvents(); // interrupted fade in
    expect(track.fadingState).toBe('out');
    track.setMaxVolume(1.0);
    expect(track.fadingState).toBe('out');

    howl.finishFade();
    howl.flushEvents();
    expect(howl.count('stop')).toBe(1);
  });

  it('ducks and restores a playing track through toEffective back to none', () => {
    const { track, howl } = makeTrack();
    track.setVolume(1.0);
    track.play();

    track.setMaxVolume(0.02);
    expect(track.fadingState).toBe('toEffective');
    howl.finishFade();
    howl.flushEvents();
    expect(track.fadingState).toBe('none');
    expect(howl.vol).toBe(0.02);

    track.setMaxVolume(1.0);
    expect(track.fadingState).toBe('toEffective');
    howl.finishFade();
    howl.flushEvents();
    expect(track.fadingState).toBe('none');
    expect(howl.vol).toBe(1.0);
    expect(howl.count('stop')).toBe(0);
  });
});

describe('TrackPlayer music switching', () => {
  it('only stops the faded-out title track when max volume is restored', () => {
    const player = new TrackPlayer({ muted: false });
    player.register('title', ['t.mp3']);
    player.register('game', ['g.mp3']);
    const [title, game] = mockHowls;
    mockHowls.forEach(h => h.opts.onload());
    player.load();

    player.play('title');
    player.fadeOutAll();
    player.play('game');
    player.setMaxVolumeAll(1.0);

    title.finishFade();
    title.flushEvents();
    game.flushEvents();

    expect(title.count('stop')).toBe(1);
    expect(game.count('stop')).toBe(0);
    expect(title.vol).toBe(0);
  });
});
