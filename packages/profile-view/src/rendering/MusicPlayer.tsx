import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ShareMediaResolver } from '../media';

/** Uma faixa do player. Derivada de um bloco `music` (o modelo continua sendo um bloco por faixa). */
export interface MusicTrack {
  id: string;
  title: string;
  artist: string | null;
  audioAssetId: string;
  coverAssetId: string | null;
}

interface ResolvedTrack extends MusicTrack {
  audioUrl: string;
  coverUrl: string | null;
}

interface MusicPlayerProps {
  tracks: MusicTrack[];
  media: ShareMediaResolver;
}

type PlayerStatus = 'loading' | 'ready' | 'error';

const WAVE_BARS = 56;

/** Waveform determinística por faixa (sem analisar o áudio): estável entre renders e reloads. */
function waveformBars(seed: string, count = WAVE_BARS): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    const value = ((hash >>> 0) % 1000) / 1000;
    bars.push(Math.round(16 + value * 84));
  }
  return bars;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <rect x="7" y="5.5" width="3.4" height="13" rx="1.1" fill="currentColor" />
      <rect x="13.6" y="5.5" width="3.4" height="13" rx="1.1" fill="currentColor" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M7 6h2.2v12H7z" fill="currentColor" />
      <path d="M18.5 6.5v11l-8.2-5.5z" fill="currentColor" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M14.8 6H17v12h-2.2z" fill="currentColor" />
      <path d="M5.5 6.5v11l8.2-5.5z" fill="currentColor" />
    </svg>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M4 9.5h3.2L11.5 6v12L7.2 14.5H4z" fill="currentColor" />
      {muted ? (
        <path
          d="M15.5 9.5l4 5m0-5l-4 5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <path
          d="M15 9a4 4 0 0 1 0 6M17.4 7a7 7 0 0 1 0 10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M6 9.5l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M6 14.5l6-6 6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Player de música com dois formatos (expandido e mini flutuante).
 *
 * - Usa um único elemento `<audio>` que persiste ao alternar entre os formatos (o áudio não
 *   reinicia ao minimizar/expandir).
 * - O progresso acompanha o elemento de áudio real (`timeupdate`); a waveform é integrada ao
 *   progresso e também serve de barra de busca (o `<input type="range">` sobreposto garante
 *   clique, teclado e leitores de tela).
 * - NUNCA inicia sozinho: o áudio só toca após ação explícita do usuário. Não há "favoritar"
 *   porque o modelo do bloco não tem esse campo (nada de botão decorativo).
 * - Avançar/retroceder só aparece quando existe mais de uma faixa.
 */
export function MusicPlayer({ tracks, media }: MusicPlayerProps) {
  const resolved = useMemo<ResolvedTrack[]>(
    () =>
      tracks
        .map((track) => {
          const audioUrl = media.resolveMediaUrl(track.audioAssetId);
          if (!audioUrl) return null;
          return {
            ...track,
            audioUrl,
            coverUrl: track.coverAssetId ? media.resolveMediaUrl(track.coverAssetId) : null,
          };
        })
        .filter((track): track is ResolvedTrack => track !== null),
    [tracks, media],
  );

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [collapsed, setCollapsed] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const safeIndex = Math.min(index, Math.max(resolved.length - 1, 0));
  const track = resolved[safeIndex];
  const activeUrl = track?.audioUrl ?? null;

  // Ao trocar de faixa, volta ao estado inicial (sem autoplay). Ajustar o estado DURANTE a
  // renderização é o padrão recomendado pelo React para reagir a uma mudança de valor — evita um
  // render em cascata dentro de um efeito.
  const [syncedUrl, setSyncedUrl] = useState(activeUrl);
  if (activeUrl !== syncedUrl) {
    setSyncedUrl(activeUrl);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setStatus('loading');
  }

  // Recarrega o elemento de áudio quando a faixa (URL) muda.
  useEffect(() => {
    audioRef.current?.load();
  }, [activeUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      const attempt = audio.play();
      if (attempt) attempt.catch(() => setStatus('error'));
    } else {
      audio.pause();
    }
  }, []);

  const seekTo = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(value)) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }, []);

  const step = useCallback(
    (delta: number) => {
      setIndex((current) => {
        const next = current + delta;
        if (next < 0 || next >= resolved.length) return current;
        return next;
      });
    },
    [resolved.length],
  );

  const bars = useMemo(() => waveformBars(track?.id ?? ''), [track?.id]);
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const playedBars = Math.round(progress * bars.length);
  const hasPlaylist = resolved.length > 1;
  const title = track?.title ?? '';
  const artist = track?.artist ?? null;

  // Sem URL de áudio resolvida não existe player real: não renderiza controles inertes.
  if (!track) return null;

  const statusNode =
    status === 'error' ? (
      <p className="share-music__status" role="alert">
        Não foi possível carregar esta faixa.
      </p>
    ) : status === 'loading' ? (
      <p className="share-music__status" role="status">
        Carregando faixa…
      </p>
    ) : null;

  const seek = (
    <div className="share-music__wave">
      <span className="share-music__wave-bars" aria-hidden="true">
        {bars.map((height, barIndex) => (
          <span
            key={barIndex}
            className={`share-music__wave-bar${barIndex < playedBars ? ' is-played' : ''}`}
            style={{ height: `${height}%` }}
          />
        ))}
      </span>
      <input
        type="range"
        className="share-music__seek"
        min={0}
        max={duration > 0 ? duration : 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        onChange={(event) => seekTo(Number(event.target.value))}
        disabled={status !== 'ready' || duration <= 0}
        aria-label="Posição na faixa"
        aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
      />
    </div>
  );

  const transport = (
    <div className="share-music__transport">
      {hasPlaylist ? (
        <button
          type="button"
          className="share-music__icon-button"
          onClick={() => step(-1)}
          disabled={safeIndex === 0}
          aria-label="Faixa anterior"
        >
          <PrevIcon />
        </button>
      ) : null}
      <button
        type="button"
        className="share-music__play"
        onClick={togglePlay}
        aria-label={playing ? `Pausar ${title}` : `Reproduzir ${title}`}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      {hasPlaylist ? (
        <button
          type="button"
          className="share-music__icon-button"
          onClick={() => step(1)}
          disabled={safeIndex >= resolved.length - 1}
          aria-label="Próxima faixa"
        >
          <NextIcon />
        </button>
      ) : null}
    </div>
  );

  const volumeControl = (
    <div className="share-music__volume">
      <button
        type="button"
        className="share-music__icon-button"
        onClick={() => setMuted((current) => !current)}
        aria-pressed={muted}
        aria-label={muted ? 'Ativar som' : 'Silenciar'}
      >
        <VolumeIcon muted={muted} />
      </button>
      <input
        type="range"
        className="share-music__volume-range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(event) => {
          const next = Number(event.target.value);
          setVolume(next);
          setMuted(next === 0);
        }}
        aria-label="Volume"
      />
    </div>
  );

  const miniNode = (
    <div className="share-music-mini" role="group" aria-label="Player de música minimizado">
      <button
        type="button"
        className="share-music__play share-music-mini__play"
        onClick={togglePlay}
        aria-label={playing ? `Pausar ${title}` : `Reproduzir ${title}`}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="share-music-mini__info">
        <span className="share-music-mini__title">{title}</span>
        {artist ? <span className="share-music-mini__artist">{artist}</span> : null}
      </div>
      {seek}
      <span className="share-music-mini__time">{formatTime(currentTime)}</span>
      <button
        type="button"
        className="share-music__icon-button"
        onClick={() => setCollapsed(false)}
        aria-label="Expandir player"
      >
        <ExpandIcon />
      </button>
    </div>
  );

  const expandedNode = (
    <figure className="share-music" aria-label={hasPlaylist ? 'Player de música' : undefined}>
      <div className="share-music__cover">
        {track.coverUrl ? (
          <img src={track.coverUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" />
        ) : (
          <span className="share-music__cover-fallback" aria-hidden="true">
            ♪
          </span>
        )}
      </div>

      <figcaption className="share-music__meta">
        {hasPlaylist ? (
          <span className="share-music__eyebrow">
            Faixa {safeIndex + 1} de {resolved.length}
          </span>
        ) : null}
        <span className="share-music__title">{title}</span>
        {artist ? <span className="share-music__artist">{artist}</span> : null}
      </figcaption>

      <div className="share-music__top-actions">
        <button
          type="button"
          className="share-music__icon-button"
          onClick={() => setCollapsed(true)}
          aria-label="Minimizar player"
        >
          <CollapseIcon />
        </button>
      </div>

      {transport}

      <div className="share-music__progress">
        {seek}
        <div className="share-music__times">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {volumeControl}

      {statusNode}
    </figure>
  );

  return (
    <div className={`share-music-root${collapsed ? ' is-collapsed' : ''}`}>
      {/* Elemento de áudio real e persistente (oculto: os controles visíveis são os do player). */}
      <audio
        ref={audioRef}
        className="share-music__audio-el"
        src={track.audioUrl}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
          setStatus('ready');
        }}
        onCanPlay={() => setStatus('ready')}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={(event) => {
          setPlaying(false);
          setCurrentTime(event.currentTarget.duration || 0);
        }}
        onError={() => setStatus('error')}
      />

      {collapsed && typeof document !== 'undefined'
        ? createPortal(miniNode, document.body)
        : expandedNode}
    </div>
  );
}
