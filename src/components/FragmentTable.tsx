import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Filter } from 'lucide-react';
import { EPUBChapter, SMILFragment, TimeDisplayFormat } from '../types/epub';
import { formatTimeInSeconds, formatTimeWithMs } from '../utils/time';
import {
  analyzeAlignment,
  boundariesFromFragments,
  cachedEnvelope,
  describeAnalysis,
  type AlignmentAnalysis,
} from '../utils/alignmentAnalysis';
import {
  computeChapterStats,
  describeStatsSummary,
  FragmentFlag,
  fragmentTexts,
  textByElementId,
} from '../utils/fragmentStats';
import { Button, IconButton, PanelHeader } from './ui';

const ONLY_FLAGGED_KEY = 'fragmentTableOnlyFlagged';
const ANALYSIS_DEBOUNCE_MS = 300;

const FLAG_LABELS: Record<FragmentFlag['kind'], string> = {
  'invalid-timing': 'timing',
  overlap: 'overlap',
  'missing-text': 'no text',
  'cuts-speech': 'cuts speech',
};

const rowTint = (flags: FragmentFlag[]): string => {
  if (flags.some((flag) => flag.severity === 'error')) return 'bg-red-500/[0.07]';
  if (flags.length > 0) return 'bg-amber-500/[0.07]';
  return '';
};

interface FragmentTableProps {
  chapter: EPUBChapter | null;
  fragments: SMILFragment[];
  selectedFragment: SMILFragment | null;
  onFragmentSelect: (fragment: SMILFragment) => void;
  decodedAudio?: AudioBuffer | null;
  hasAudio?: boolean;
  timeDisplayFormat?: TimeDisplayFormat;
  onApplyTimeOffset?: (fromTime: number, offsetSeconds: number) => void;
  onNudgeFragmentStart?: (fragmentId: string, deltaSeconds: number) => void;
  multiAudio?: boolean;
  autoFollow?: boolean;
}

export const FragmentTable: React.FC<FragmentTableProps> = ({
  chapter,
  fragments,
  selectedFragment,
  onFragmentSelect,
  decodedAudio = null,
  hasAudio = false,
  timeDisplayFormat = 'clock',
  onApplyTimeOffset,
  onNudgeFragmentStart,
  multiAudio = false,
  autoFollow = true,
}) => {
  const [onlyFlagged, setOnlyFlagged] = useState(() => localStorage.getItem(ONLY_FLAGGED_KEY) === 'true');
  const [analysis, setAnalysis] = useState<AlignmentAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const formatTime = timeDisplayFormat === 'seconds' ? formatTimeInSeconds : formatTimeWithMs;

  const chapterText = useMemo(() => textByElementId(chapter?.content ?? ''), [chapter?.content]);

  const { rows, summary } = useMemo(
    () =>
      computeChapterStats(fragments, fragmentTexts(fragments, chapterText), {
        alignment: analysis,
        hasSharedTimeline: !multiAudio,
      }),
    [fragments, chapterText, analysis, multiAudio]
  );

  const visibleRows = useMemo(
    () => (onlyFlagged ? rows.filter((row) => row.flags.length > 0) : rows),
    [rows, onlyFlagged]
  );

  useEffect(() => {
    localStorage.setItem(ONLY_FLAGGED_KEY, String(onlyFlagged));
  }, [onlyFlagged]);

  useEffect(() => {
    if (multiAudio || !decodedAudio || fragments.length === 0) {
      setAnalysis(null);
      setIsAnalyzing(false);
      return;
    }

    // Debounced: measuring boundaries while a region is still being dragged
    // would burn the envelope on every frame and report transient positions.
    setIsAnalyzing(true);
    const timeout = window.setTimeout(() => {
      try {
        setAnalysis(analyzeAlignment(cachedEnvelope(decodedAudio), boundariesFromFragments(fragments)));
      } catch (error) {
        console.error('Boundary analysis failed:', error);
        setAnalysis(null);
      } finally {
        setIsAnalyzing(false);
      }
    }, ANALYSIS_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [decodedAudio, fragments, multiAudio]);

  useEffect(() => {
    if (!selectedFragment || !autoFollow) return;
    const container = scrollRef.current;
    if (!container) return;
    const row = container.querySelector(`[data-fragment-id="${CSS.escape(selectedFragment.id)}"]`);
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedFragment, autoFollow, visibleRows]);

  const pendingShiftMs =
    analysis && analysis.bestOffsetSeconds !== 0 ? Math.round(analysis.bestOffsetSeconds * 1000) : 0;

  const hasStructuralFlags = rows.some((row) =>
    row.flags.some((flag) => flag.kind !== 'cuts-speech')
  );
  const audioCuts = analysis?.flagged.length ?? 0;

  const status = fragments.length === 0
    ? 'No fragments'
    : hasStructuralFlags
      ? `${summary.flagged} flagged`
      : multiAudio
        ? 'Diagnostics unavailable'
        : audioCuts > 0
        ? audioCuts === 1
          ? '1 needs a listen'
          : `${audioCuts} need a listen`
        : !hasAudio
          ? 'No audio'
          : !decodedAudio
            ? 'Loading audio…'
            : isAnalyzing
              ? 'Checking audio…'
              : analysis === null
                ? 'No analysis'
                : 'All clear';

  const statusTone =
    summary.errors > 0 ? 'text-red-400' : summary.flagged > 0 || audioCuts > 0 ? 'text-amber-400' : 'text-gray-500';

  if (!chapter) {
    return (
      <div className="flex-1 bg-base flex items-center justify-center">
        <p className="text-sm text-gray-500">Select a chapter to inspect its fragments</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 bg-base flex flex-col">
      <PanelHeader title={chapter.href}>
        {pendingShiftMs !== 0 && analysis && onApplyTimeOffset && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onApplyTimeOffset(0, analysis.bestOffsetSeconds)}
            title="Move every fragment in this chapter by the same amount, so boundaries land in the pauses"
          >
            Shift all by {pendingShiftMs}ms
          </Button>
        )}
        <span
          className={`text-xs tabular-nums ${statusTone}`}
          title={[describeStatsSummary(summary), analysis ? describeAnalysis(analysis) : null]
            .filter(Boolean)
            .join('\n')}
        >
          {status}
        </span>
        <IconButton
          onClick={() => setOnlyFlagged((value) => !value)}
          active={onlyFlagged}
          title={onlyFlagged ? 'Show all fragments' : 'Show only flagged fragments'}
        >
          <Filter className="w-4 h-4" />
        </IconButton>
      </PanelHeader>

      {multiAudio && (
        <div className="flex-shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          This chapter plays several audio files. Audio diagnostics are disabled for this chapter.
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto">
        {visibleRows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">
            {fragments.length === 0 ? 'This chapter has no media overlays.' : 'No fragments look wrong.'}
          </p>
        ) : (
          <table className="w-full min-w-[37rem] table-fixed text-xs">
            <colgroup>
              <col className="w-8" />
              <col className="w-56" />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-16" />
              <col className="w-28" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-2 py-2 font-semibold text-right">#</th>
                <th className="px-2 py-2 font-semibold text-left">Text</th>
                <th className="px-2 py-2 font-semibold text-right">Start</th>
                <th className="px-2 py-2 font-semibold text-right">End</th>
                <th className="px-2 py-2 font-semibold text-right">Dur</th>
                <th className="px-2 py-2 font-semibold text-left">Problem</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const isSelected = selectedFragment?.id === row.id;
                const errorFlag = row.flags.find((flag) => flag.severity === 'error');
                const primaryFlag = errorFlag ?? row.flags[0];
                const fixShift = row.flags.find((flag) => flag.kind === 'cuts-speech')?.shiftSeconds;
                const canFix =
                  fixShift !== undefined &&
                  analysis?.bestOffsetSeconds === 0 &&
                  onNudgeFragmentStart !== undefined;
                const title = [row.text, ...row.flags.map((flag) => flag.message)].join('\n');
                return (
                  <tr
                    key={row.id}
                    data-fragment-id={row.id}
                    onClick={() => onFragmentSelect(row.fragment)}
                    title={title}
                    className={`cursor-pointer border-b border-line/60 ${
                      isSelected ? 'bg-blue-500/15' : rowTint(row.flags)
                    }`}
                  >
                    <td className="px-2 py-1 text-right tabular-nums text-gray-600">{row.index + 1}</td>
                    <td className="px-2 py-1 truncate text-gray-200">{row.text || <span className="text-gray-600">—</span>}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-400">{formatTime(row.start)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-400">{formatTime(row.end)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-400">{row.duration.toFixed(2)}s</td>
                    <td className="px-2 py-1">
                      {primaryFlag && (
                        <span
                          className={`inline-flex items-center gap-1 whitespace-nowrap ${
                            errorFlag ? 'text-red-400' : 'text-amber-400'
                          }`}
                        >
                          {errorFlag ? <AlertCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                          {FLAG_LABELS[primaryFlag.kind]}
                          {row.flags.length > 1 && <span className="text-gray-500">+{row.flags.length - 1}</span>}
                          {canFix && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onNudgeFragmentStart(row.id, fixShift);
                              }}
                              className="ml-0.5 px-1 py-0.5 rounded text-blue-400 hover:bg-blue-500/15 hover:text-blue-300"
                              title={`Move this boundary ${Math.round(fixShift * 1000)}ms to the nearest pause`}
                            >
                              Fix
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
