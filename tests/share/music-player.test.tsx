import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MusicPlayer, ProfileSection } from '@hattz/profile-view';
import type { ShareMediaResolver } from '@hattz/profile-view';

/**
 * Testes do player de música (formatos expandido e mini).
 *
 * jsdom não reproduz áudio de verdade, então os métodos de `HTMLMediaElement` são substituídos:
 * o objetivo aqui é garantir a ESTRUTURA, a acessibilidade e a fiação dos controles (nenhum botão
 * decorativo) — não a decodificação do áudio.
 */

const media: ShareMediaResolver = {
  resolveMediaUrl: (assetId) => {
    if (assetId === 'audio_1') return 'blob:mock/audio-1';
    if (assetId === 'audio_2') return 'blob:mock/audio-2';
    if (assetId === 'cover_1') return 'blob:mock/cover-1';
    return null;
  },
};

const singleTrack = [
  {
    id: 'blk_1',
    title: 'Faixa Um',
    artist: 'Artista',
    audioAssetId: 'audio_1',
    coverAssetId: 'cover_1',
  },
];

let playSpy: MockInstance;
let pauseSpy: MockInstance;
let pausedState = true;

beforeEach(() => {
  pausedState = true;
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
    pausedState = false;
    return Promise.resolve();
  });
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {
    pausedState = true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Faz o elemento de áudio responder a `paused` como um player real (o jsdom sempre devolve true). */
function audioOf(container: HTMLElement): HTMLAudioElement {
  const audio = container.querySelector('audio');
  if (!audio) throw new Error('audio element not rendered');
  Object.defineProperty(audio, 'paused', { configurable: true, get: () => pausedState });
  return audio;
}

describe('MusicPlayer (expanded + mini)', () => {
  it('renders the expanded player with real, labelled controls and no autoplay', () => {
    const { container } = render(<MusicPlayer tracks={singleTrack} media={media} />);

    expect(screen.getByText('Faixa Um')).toBeVisible();
    expect(screen.getByText('Artista')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reproduzir Faixa Um' })).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Posição na faixa' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();

    const audio = audioOf(container);
    expect(audio).toHaveAttribute('src', 'blob:mock/audio-1');
    // Nunca inicia sozinho.
    expect(audio).not.toHaveAttribute('autoplay');
    expect(playSpy).not.toHaveBeenCalled();

    const cover = container.querySelector('.share-music__cover img');
    expect(cover).toHaveAttribute('src', 'blob:mock/cover-1');
  });

  it('does not offer a favourite button (the block model has no such field)', () => {
    render(<MusicPlayer tracks={singleTrack} media={media} />);
    expect(screen.queryByRole('button', { name: /favorit/i })).toBeNull();
  });

  it('wires play/pause to the real audio element and follows its events', () => {
    const { container } = render(<MusicPlayer tracks={singleTrack} media={media} />);
    const audio = audioOf(container);

    fireEvent.click(screen.getByRole('button', { name: 'Reproduzir Faixa Um' }));
    expect(playSpy).toHaveBeenCalledTimes(1);

    // O player reflete o estado real do áudio (evento `play`), não o clique.
    fireEvent.play(audio);
    expect(screen.getByRole('button', { name: 'Pausar Faixa Um' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Pausar Faixa Um' }));
    expect(pauseSpy).toHaveBeenCalledTimes(1);

    fireEvent.pause(audio);
    expect(screen.getByRole('button', { name: 'Reproduzir Faixa Um' })).toBeVisible();
  });

  it('seeks through the waveform slider and shows the audio progress', () => {
    const { container } = render(<MusicPlayer tracks={singleTrack} media={media} />);
    const audio = audioOf(container);

    let currentTime = 0;
    Object.defineProperty(audio, 'duration', { configurable: true, get: () => 120 });
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
    });

    fireEvent.loadedMetadata(audio);

    const seek = screen.getByRole('slider', { name: 'Posição na faixa' });
    expect(seek).toBeEnabled();
    fireEvent.change(seek, { target: { value: '30' } });

    expect(audio.currentTime).toBe(30);
    expect(seek).toHaveValue('30');
    expect(screen.getByText('0:30')).toBeVisible();
    expect(screen.getByText('2:00')).toBeVisible();
  });

  it('shows the error state when the audio fails to load', () => {
    const { container } = render(<MusicPlayer tracks={singleTrack} media={media} />);
    const audio = audioOf(container);

    fireEvent.error(audio);

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar esta faixa.');
    expect(screen.getByRole('slider', { name: 'Posição na faixa' })).toBeDisabled();
  });

  it('moves to a floating mini player (portal) without restarting the audio element', () => {
    const { container } = render(<MusicPlayer tracks={singleTrack} media={media} />);
    const audio = audioOf(container);

    fireEvent.click(screen.getByRole('button', { name: 'Minimizar player' }));

    // O mini é portalado para o body: não é recortado pelo `backdrop-filter` dos painéis.
    const mini = screen.getByRole('group', { name: 'Player de música minimizado' });
    expect(mini.parentElement).toBe(document.body);
    expect(screen.queryByText('Faixa Um')).toBeVisible();
    expect(container.querySelector('.share-music')).toBeNull();
    // O mesmo elemento de áudio continua montado (o áudio não reinicia ao minimizar).
    expect(container.querySelector('audio')).toBe(audio);

    fireEvent.click(screen.getByRole('button', { name: 'Expandir player' }));
    expect(container.querySelector('.share-music')).not.toBeNull();
    expect(screen.queryByRole('group', { name: 'Player de música minimizado' })).toBeNull();
  });

  it('renders nothing when no audio URL can be resolved (no inert controls)', () => {
    const { container } = render(
      <MusicPlayer tracks={[{ ...singleTrack[0]!, audioAssetId: 'missing' }]} media={media} />,
    );
    expect(container.querySelector('.share-music-root')).toBeNull();
    expect(container.querySelector('audio')).toBeNull();
  });
});

describe('ProfileSection music playlist', () => {
  const section = {
    id: 'sec_music',
    type: 'music',
    order: 1,
    blocks: [
      {
        id: 'blk_1',
        type: 'music',
        order: 1,
        props: { title: 'Faixa Um', artist: 'Artista', assetId: 'audio_1' },
      },
      { id: 'blk_2', type: 'music', order: 2, props: { title: 'Faixa Dois', assetId: 'audio_2' } },
    ],
  };

  it('groups multiple music blocks into a single player with prev/next', () => {
    const { container } = render(<ProfileSection section={section} media={media} />);

    expect(container.querySelectorAll('.share-music-root')).toHaveLength(1);
    expect(screen.getByText('Faixa 1 de 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Faixa anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próxima faixa' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima faixa' }));

    expect(screen.getByText('Faixa 2 de 2')).toBeVisible();
    expect(screen.getByText('Faixa Dois')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Próxima faixa' })).toBeDisabled();
  });
});
