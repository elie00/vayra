/**
 * THIS IS THE CLEAN VERSION (without debug logs)
 * Use this to replace episode-detail.tsx after confirming the debug version works
 */

/**
 * Episode Detail View Component
 * 
 * Displays comprehensive episode information including:
 * - Hero section with episode still/backdrop
 * - Episode metadata (title, description, rating, air date, runtime)
 * - Episode stills gallery
 * - Guest stars section
 * - TMDB ratings with MDBList integration
 * - IMDB ratings
 * 
 * Requirements: 3, 4, 5, 6, 7, 8, 9, 10
 */

import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Play, Loader2 } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import type { EpisodeDetail } from "@/lib/providers/tmdb/tmdb-episode-types";
import { fetchEpisodeData } from "@/lib/episode-data-fetcher";
import { meta as fetchCinemetaMeta } from "@/lib/cinemeta";
import { useSettings } from "@/lib/settings";
import { useView, type PlayEpisode } from "@/lib/view";
import { useT } from "@/lib/i18n";
import { useOmdbScores, type OmdbScores } from "@/lib/providers/omdb";
import { useMdblistScores, type MdblistScores } from "@/lib/providers/mdblist";
import { useTmdbImdbId } from "@/lib/providers/tmdb";
import { HeroRatings } from "@/views/detail/hero-ratings";
import { CastCard } from "@/views/detail/cast-card";
import { Row } from "@/components/row";
import type { CastEntry } from "@/lib/providers/tmdb";

export interface EpisodeDetailViewProps {
  seriesId: string;
  season: number;
  episode: number;
  seriesMeta?: Meta;
}

/**
 * Main Episode Detail View Component
 * 
 * Responsibilities:
 * - Fetch series metadata if not provided (Task 5.2)
 * - Fetch episode details from TMDB/Cinemeta (Task 5.3)
 * - Handle loading and error states
 * - Coordinate between sections
 * - Manage navigation interactions
 */
export function EpisodeDetailView({
  seriesId,
  season,
  episode,
  seriesMeta: initialSeriesMeta,
}: EpisodeDetailViewProps) {
  const t = useT();
  const { settings } = useSettings();
  const { openPicker, openMeta, goBack } = useView();
  
  // Extract stable references to prevent infinite loops
  const tmdbKey = settings.tmdbKey;
  const mdblistKey = settings.mdblistKey;
  const instantPlay = settings.instantPlay;
  const showRtBadge = settings.showRtBadge;
  
  // State management
  const [seriesMeta, setSeriesMeta] = useState<Meta | null>(initialSeriesMeta || null);
  const [episodeData, setEpisodeData] = useState<EpisodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track component mount status for cleanup
  const mounted = useRef(true);
  
  // Fetch IMDB ID and ratings
  const resolvedImdb = useTmdbImdbId(seriesMeta?.id);
  const imdbId = resolvedImdb ?? (seriesMeta?.id.startsWith("tt") ? seriesMeta.id : null);
  const omdbScores = useOmdbScores(imdbId ?? undefined);
  const mdblistScores = useMdblistScores(mdblistKey, imdbId);
  
  // Handler: Open URL in external browser
  const handleOpenUrl = (url: string) => {
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };
  
  // Effect: Fetch series metadata if not provided (Task 5.2)
  // FIX: Only depend on initialSeriesMeta.id to prevent infinite loops from object reference changes
  const initialSeriesMetaId = initialSeriesMeta?.id;
  
  useEffect(() => {
    if (initialSeriesMeta) {
      // Only set if we don't already have it or if the ID changed
      setSeriesMeta(prev => {
        if (prev?.id === initialSeriesMeta.id) {
          return prev; // Prevent unnecessary setState
        }
        return initialSeriesMeta;
      });
      return;
    }
    
    let cancelled = false;
    
    (async () => {
      try {
        const meta = await fetchCinemetaMeta(seriesId);
        if (!cancelled && mounted.current) {
          setSeriesMeta(meta);
        }
      } catch (err) {
        if (!cancelled && mounted.current) {
          console.error('[episode-detail] Failed to fetch series meta:', err);
          setError(t("Unable to load series information"));
          setLoading(false);
        }
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [seriesId, initialSeriesMetaId, t]);
  
  // Effect: Fetch episode data (Task 5.3)
  // Use stable seriesMeta.id instead of entire seriesMeta object to prevent infinite loops
  const seriesMetaId = seriesMeta?.id;
  
  useEffect(() => {
    // Wait for series metadata to be available
    if (!seriesMeta || !seriesMetaId) return;
    
    let cancelled = false;
    
    (async () => {
      setLoading(true);
      setError(null);
      
      try {
        const data = await fetchEpisodeData(
          seriesId,
          seriesMeta,
          season,
          episode,
          { tmdbKey } as any,
        );
        
        if (!cancelled && mounted.current) {
          if (data) {
            setEpisodeData(data);
          } else {
            setError(t("Episode information is not available"));
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled && mounted.current) {
          console.error('[episode-detail] Failed to fetch episode data:', err);
          setError(
            err instanceof Error 
              ? err.message 
              : t("An unexpected error occurred")
          );
          setLoading(false);
        }
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [seriesId, seriesMetaId, season, episode, tmdbKey, t]);
  
  // Cleanup effect to prevent state updates on unmounted component
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  
  // Handler: Navigate to play picker
  const handlePlay = () => {
    if (!seriesMeta || !episodeData) return;
    
    const playEpisode: PlayEpisode = {
      season: episodeData.seasonNumber,
      episode: episodeData.episodeNumber,
      name: episodeData.name,
      still: episodeData.stillPath || undefined,
      overview: episodeData.overview || undefined,
    };
    
    openPicker(seriesMeta, playEpisode, { autoPlay: instantPlay });
  };
  
  // Handler: Navigate to series detail page
  const handleSeriesClick = () => {
    if (seriesMeta) {
      openMeta(seriesMeta);
    }
  };
  
  // Render: Error state
  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-12">
        <div className="text-center max-w-md">
          <h2 className="mb-4 text-[24px] font-semibold text-ink">
            {t("Episode Not Found")}
          </h2>
          <p className="mb-6 text-[14px] text-ink-muted">
            {error}
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={goBack}
              className="flex items-center gap-2 rounded-lg bg-elevated px-5 py-2.5 text-[14px] font-semibold text-ink ring-1 ring-edge transition-colors hover:bg-raised"
            >
              <ArrowLeft size={16} />
              {t("Go Back")}
            </button>
            {seriesMeta && (
              <button
                onClick={handleSeriesClick}
                className="rounded-lg bg-ink px-5 py-2.5 text-[14px] font-semibold text-canvas transition-colors hover:bg-ink/90"
              >
                {t("View Series")}
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }
  
  // Render: Loading state with skeleton
  if (loading || !episodeData || !seriesMeta) {
    return (
      <main className="min-h-screen">
        <LoadingSkeleton />
      </main>
    );
  }
  
  // Render: Success state with episode content
  return (
    <main className="min-h-screen overflow-y-auto bg-canvas">
      {/* Hero Section */}
      <EpisodeHero
        episodeTitle={episodeData.name}
        episodeNumber={episodeData.episodeNumber}
        seasonNumber={episodeData.seasonNumber}
        seriesName={seriesMeta.name}
        seriesLogo={seriesMeta.logo}
        backdrop={seriesMeta.background}
        still={episodeData.stillPath}
        rating={episodeData.voteAverage}
        airDate={episodeData.airDate}
        runtime={episodeData.runtime}
        onPlay={handlePlay}
        onSeriesClick={handleSeriesClick}
        // Pass ratings data
        imdbRating={seriesMeta.imdbRating}
        omdbScores={omdbScores}
        mdblistScores={mdblistScores}
        imdbId={imdbId}
        showRtBadge={showRtBadge}
        onOpenUrl={handleOpenUrl}
      />
      
      {/* Episode Information */}
      <div className="mx-auto max-w-7xl px-6 py-12">
        <EpisodeInfoSection
          overview={episodeData.overview}
          season={episodeData.seasonNumber}
          episode={episodeData.episodeNumber}
          airDate={episodeData.airDate}
          runtime={episodeData.runtime}
          voteAverage={episodeData.voteAverage}
          voteCount={episodeData.voteCount}
        />
        
        {/* Episode Stills Gallery */}
        {episodeData.stills && episodeData.stills.length > 0 && (
          <EpisodeStillsGallery
            stills={episodeData.stills}
            episodeTitle={episodeData.name}
          />
        )}
        
        {/* Guest Stars Section */}
        {episodeData.guestStars && episodeData.guestStars.length > 0 && (
          <GuestStarsSection
            guestStars={episodeData.guestStars}
          />
        )}
      </div>
    </main>
  );
}

// ... rest of the component code (LoadingSkeleton, EpisodeHero, etc.) stays the same
