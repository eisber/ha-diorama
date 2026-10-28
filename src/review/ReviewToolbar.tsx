import type { ReviewState } from './useReview.ts'
import { reviewButton } from '../lib/workshop.ts'

export default function ReviewToolbar({ review }: { review: ReviewState }) {
  if (!review.enabled) return null
  return (
    <div className="absolute top-3 right-3 z-20 flex max-w-[85%] flex-wrap justify-end gap-1.5" data-review-toolbar>
      {(['inspect', 'comment', 'measure'] as const).map(mode => (
        <button
          key={mode}
          className={reviewButton}
          aria-pressed={review.mode === mode}
          onClick={() => review.chooseMode(mode)}
        >
          {mode === 'inspect'
            ? 'Inspect'
            : mode === 'comment'
              ? 'Comments'
              : `Measure ${review.measured}/${review.dimensions.length}`}
        </button>
      ))}
      {review.mode === 'comment' && (
        <label className={reviewButton}>
          <input
            type="checkbox"
            checked={review.showResolved}
            onChange={e => review.setShowResolved(e.target.checked)}
          />{' '}
          Show solved
        </label>
      )}
      {review.error && (
        <div role="alert" className="basis-full rounded-xl bg-slate-950/95 p-3 text-xs text-amber-200">
          {review.error}
          <div className="mt-2 flex gap-2">
            <button className={reviewButton} onClick={() => void review.load()}>
              Reload review
            </button>
            {!review.document && review.canWrite && (
              <button className={reviewButton} disabled={review.busy} onClick={() => void review.initialize()}>
                Initialize dedicated store
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
