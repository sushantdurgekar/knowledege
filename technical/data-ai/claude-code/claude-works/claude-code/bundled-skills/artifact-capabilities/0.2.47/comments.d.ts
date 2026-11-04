/**
 * The `comments` capability — write comment threads on THIS artifact from
 * the page's own UI, as the current viewer.
 *
 * A page that carries its own commenting affordances (an "Add comment"
 * button on a card, a margin-note control) declares
 * `capabilities: {comments: {}}` and calls these verbs; every thread it
 * writes lands in the artifact's one shared comment store — the store
 * the claude.ai shell's comment mode renders — labelled as written via
 * the artifact. A declaring artifact is organization-internal and cannot
 * be shared publicly — except under the composer-only form,
 * `capabilities: {comments: {"composer_only": true}}`, which grants
 * ONLY {@link Claude.Comments.openComposer} and
 * {@link Claude.Comments.anchorFor} (the write verbs reject
 * `not_granted` and {@link Claude.Comments.canSendToClaude} resolves
 * `"off"`), never prompts for consent, and keeps the artifact
 * publicly shareable. The page never holds a credential: the shell
 * performs every write with the viewer's own account, and attribution is
 * stamped by the platform, never taken from the page.
 *
 * WRITE-ONLY by design: there is no verb to list, read, edit, or watch
 * threads — the shell's comment mode already shows every thread to every
 * viewer and refreshes after each successful write from this page, and
 * posted text is final (no one can edit it afterwards, the viewer
 * included). Do not build the page's own thread list on top of these
 * calls; offer the write affordance, confirm in place, and let the shell
 * display the thread. Keep a returned `threadId` only if the page will
 * act on that thread again this visit — nothing hands it back later.
 *
 * Consent is the viewer's, per artifact, asked at the FIRST write: the
 * shell holds that call and shows the viewer a prompt, so it may stay
 * pending for as long as they take to decide. Call only from a
 * deliberate viewer gesture, never at load or on a timer. Obtain the
 * namespace with `await claude.use("comments")` — `null` means this
 * view cannot run the capability; design for absence.
 */

declare namespace Claude {
  /**
   * Failure design — read before writing any call site. Two failures are
   * ROUTINE:
   *
   * - `consent_required` — the viewer has not (yet) allowed this page to
   *   comment as them. A dismissed prompt is not shown again during this
   *   page load — repeat calls settle `consent_required` quietly — so
   *   keep the draft text in the page's own UI, say the comment was not
   *   posted, and never loop or re-call on a timer.
   * - `forbidden` — this viewer cannot comment through the page: they
   *   chose not to allow it, they lack access, or the artifact no longer
   *   declares the capability. PERMANENT for this view — allowing again
   *   happens only from the viewer's own comment panel in claude.ai,
   *   never from the page: hide or disable write affordances from then
   *   on, with copy that says commenting from the page is off here
   *   rather than that something failed. On `resolve`/`delete` it can
   *   instead mean the viewer lacks moderation reach over that one
   *   thread (only its starter or an editor of the artifact has it) —
   *   disable that thread's control, not commenting as a whole.
   *
   * The rest are exceptional: branch the UX on the error `code`, never on
   * message text; retry only `unavailable` and `upstream_error`, at most
   * once after a short randomized delay and only from a fresh viewer
   * gesture — a rejected write is NOT proof nothing was written, so never
   * re-issue one unattended; treat `rate_limited` as a signal to slow the
   * page's own cadence, never to retry-loop.
   */
  namespace comments {
    /**
     * Rejection shape for every method. Branch on `.code`; `.message`
     * is human-readable but not localized.
     */
    interface CommentsError {
      code: CommentsErrorCode;
      message: string;
    }

    /**
     * Stable error codes. Treat unknown codes as `"upstream_error"` —
     * but note the lifecycle codes below are PERMANENT for the view:
     * never retry them.
     *
     * - `consent_required` — the viewer has not allowed page-written
     *   comments on this artifact yet. See the failure-design note above.
     * - `forbidden` — the viewer cannot write comments through this page
     *   (refused, no access, or no longer declared), or lacks moderation
     *   reach over the one thread a `resolve`/`delete` named.
     * - `invalid` — the arguments were rejected: empty or whitespace-only
     *   text, text over 4 KiB as UTF-8 or carrying control characters
     *   other than newlines and tabs, a malformed anchor or `threadId`,
     *   or arguments that are not plain data. Fix the call; do not retry
     *   it.
     * - `not_found` — the thread does not exist (deleted, on another
     *   artifact, or never visible to this viewer — not distinguishable).
     * - `rate_limited` — writing too often; slow down.
     * - `unavailable` — comments cannot be used from this view right now
     *   (the service is briefly degraded, commenting is switched off for
     *   this artifact, or the consent prompt could not be shown). One
     *   retry from a fresh gesture is reasonable; if it repeats, hide
     *   write affordances for this visit.
     * - `upstream_error` — anything else: a transient fault, or a
     *   condition retrying cannot fix (the artifact's thread or reply
     *   limit — design for deliberate, viewer-initiated threads, not one
     *   per element). If the one retry repeats it, stop and tell the
     *   viewer. Also the unanswered-call shape when the shell stops
     *   replying.
     * - `claude_unavailable` — {@link Comments.sendToClaude} only: the
     *   comment could not be sent to Claude from this view, decided BEFORE
     *   anything was written, so NOTHING was posted. The viewer is not an
     *   editor of the artifact, no Claude session could receive it, the
     *   call did not come from the viewer's own recent gesture, or sending
     *   to Claude is off here. Unlike `unavailable`, plain
     *   {@link Comments.create} / {@link Comments.reply} remain usable:
     *   keep the draft, offer the plain comment, and re-check
     *   {@link Comments.canSendToClaude} before offering the send again.
     *
     * Lifecycle codes (from the runtime itself, not the write path) —
     * permanent for this view, never retryable:
     * - `not_granted` — the viewer's session did not grant `comments` to
     *   this frame (undeclared artifact, or a view that cannot comment);
     *   render the page without its write affordances.
     * - `capability_disabled` — granted but not usable in this view (the
     *   serving runtime predates it, or its module failed to load);
     *   treat like `not_granted`.
     * - `capability_removed` — the called method is not part of the
     *   runtime serving this view; treat like `capability_disabled`.
     * - `transform_error` — the call's arguments could not be prepared;
     *   treat like `invalid`.
     */
    type CommentsErrorCode =
      | "consent_required"
      | "forbidden"
      | "invalid"
      | "not_found"
      | "rate_limited"
      | "unavailable"
      | "upstream_error"
      | "claude_unavailable"
      | "not_granted"
      | "capability_disabled"
      | "capability_removed"
      | "transform_error";

    /**
     * Where a thread sits on the page — the positioning vocabulary the
     * shell's own click-to-comment produces, so a page-placed thread's
     * marker renders exactly where a shell-placed one would. Obtain it
     * from {@link Comments.anchorFor} and pass it on unchanged; the
     * fields are positioning data for the shell, so treat the object as
     * opaque and never persist it as layout data.
     */
    interface Anchor {
      path: string;
      x: number;
      y: number;
    }

    /** Resolution shape for {@link Comments.create}. */
    interface CreateResult {
      /** The new thread's identifier — the handle {@link Comments.reply},
       * {@link Comments.resolve}, and {@link Comments.delete} take. */
      threadId: string;
      /** The thread's opening comment. Informational. */
      commentId: string;
    }

    /** Resolution shape for {@link Comments.reply}. */
    interface ReplyResult {
      /** The appended comment. Informational. */
      commentId: string;
    }

    /**
     * What {@link Comments.sendToClaude} writes: a NEW thread at `anchor`
     * (as {@link Comments.create} would), or a reply into `threadId` (as
     * {@link Comments.reply} would) — exactly one of the two, with the
     * same text rules.
     */
    type SendToClaudeTarget =
      | { anchor: Anchor; text: string }
      | { threadId: string; text: string };

    /** Resolution shape for {@link Comments.sendToClaude}: the comment
     * was posted AND sent to Claude (the platform committed the send and
     * notified Claude sessions watching the artifact; a reply arrives in
     * the thread later, not in this result). */
    interface SendToClaudeResult {
      /** The thread written to — new (anchor form) or the one named. */
      threadId: string;
      /** The posted comment. Informational. */
      commentId: string;
    }

    /**
     * Resolution of {@link Comments.canSendToClaude} — whether
     * {@link Comments.sendToClaude} can go through for this viewer right
     * now. A snapshot, not a subscription: re-check when (re)showing the
     * control. Treat any unrecognized value as unavailable.
     *
     * - `available` — offer "Send to Claude".
     * - `writers_only` — the viewer can comment but is not an editor of
     *   the artifact; offer the plain comment only.
     * - `no_session` — no Claude session could receive it right now.
     * - `off` — sending to Claude is not offered in this view at all.
     */
    type CanSendToClaude = "available" | "writers_only" | "no_session" | "off";

    /**
     * Where {@link Comments.openComposer} opens the shell's composer:
     * exactly one of an Element or a Range, both attached to the current
     * document at call time. A Range's selected text becomes the
     * composer's quoted excerpt when it fits the platform's span bounds;
     * an oversized or unusual selection quietly degrades to the
     * enclosing element — the open itself never fails over it. The
     * target is taken as given; the page's `data-comment-target`
     * attribute, which anchors a viewer's own comment-mode click anywhere
     * inside a marked element to that element, does not apply to it.
     */
    type ComposerTarget = { element: Element } | { range: Range };

    /**
     * Resolution shape for {@link Comments.openComposer}. `opened:
     * false` is a SOFT refusal, not an error: the viewer is not
     * currently engaged with the artifact (the page does not hold
     * focus — open from the viewer's own in-page gesture and it will),
     * the shell is protecting a composer the viewer already has open
     * with typed text, or the target sits inside a subtree the page
     * marked `data-uncommentable`. Do nothing — never retry in a loop.
     */
    interface OpenComposerResult {
      opened: boolean;
    }
  }

  /**
   * The `comments` verbs. Every method resolves with its
   * documented shape or rejects with {@link comments.CommentsError}; none
   * throws synchronously. Text is plain text — newlines allowed, no
   * markup rendered, at most 4 KiB as UTF-8; bound the page's input to
   * match. Writing "@Claude" in page-supplied text does NOT bring Claude
   * into the thread; the page's only way to send a comment to Claude is
   * {@link Comments.sendToClaude}, for editors of the artifact.
   */
  interface Comments {
    /**
     * Open the claude.ai shell's own new-comment composer anchored at
     * `target` — exactly what happens when the viewer enters comment
     * mode and clicks there. The page posts NOTHING: typing, submitting,
     * attribution, and display all stay in the shell, so this verb needs
     * no consent prompt and works for any viewer who could comment from
     * the shell anyway. Use it to make commenting discoverable from the
     * page's own UI (a "Comment" item in a context menu, a button on a
     * card); call it only from a deliberate viewer gesture — never on
     * load, on a timer, or in a loop (programmatic opens are
     * rate-limited: `rate_limited` rejections mean slow down).
     *
     * Resolves `{opened: true}` when the composer opened, and the soft
     * refusal `{opened: false}` when the shell declined to disturb a
     * composer holding the viewer's typed text (see
     * {@link comments.OpenComposerResult}). Rejects `unavailable` when
     * this view has no comments UI to open (the viewer cannot comment
     * here, or comments are off) — treat it as permanent for this view
     * and hide the affordance; `invalid` for a target that is not a
     * connected Element or Range.
     *
     * Available under BOTH declaration forms — the full
     * `capabilities: {comments: {}}` and the composer-only
     * `capabilities: {comments: {"composer_only": true}}`. Declare
     * composer-only when the page only wants this entry-point verb (and
     * {@link Comments.anchorFor}): the write verbs then reject
     * `not_granted`, no consent is ever asked, and — unlike a full
     * declaration — the artifact stays publicly shareable.
     */
    openComposer(
      target: comments.ComposerTarget,
    ): Promise<comments.OpenComposerResult>;

    /**
     * Build the {@link comments.Anchor} for `el`. Runs page-side and
     * never prompts; element geometry is read at call time, so call it at
     * the moment of the viewer's gesture on the element they are
     * commenting on, then pass the result straight to
     * {@link Comments.create}. Rejects `invalid` only when `el` is not an
     * element attached to the current document.
     */
    anchorFor(el: Element): Promise<comments.Anchor>;

    /**
     * Start a new thread at `anchor` with opening text `text`, written as
     * the current viewer. The first write on an artifact may stay pending
     * while the shell asks the viewer for consent. On success the shell's
     * comment display picks the thread up.
     */
    create(opts: {
      anchor: comments.Anchor;
      text: string;
    }): Promise<comments.CreateResult>;

    /** Append a reply to thread `threadId`, as the current viewer. Same
     * consent and text rules as {@link Comments.create}; an unknown or
     * deleted thread rejects `not_found`. */
    reply(threadId: string, text: string): Promise<comments.ReplyResult>;

    /**
     * Post a comment AND send it to Claude, exactly as the viewer pressing
     * "Send to Claude" in the claude.ai comment composer would: a new
     * thread at `anchor` or a reply into `threadId`, after which Claude
     * is brought into the thread and replies there. Editors of the
     * artifact only, and only from the viewer's own recent gesture — call
     * {@link Comments.canSendToClaude} first and enable the control only
     * on `"available"` (hide it, or show it disabled with the reason,
     * otherwise). Same consent, text, and thread rules (and the
     * same `consent_required` / `forbidden` / `invalid` / `not_found` /
     * `rate_limited` rejections) as {@link Comments.create} and
     * {@link Comments.reply}; additionally rejects `claude_unavailable`
     * when the send cannot go through — decided before anything is
     * written, so nothing was posted and the plain write verbs still
     * work. Sends are held to a human cadence: `rate_limited` means slow
     * down. Where the platform predates this method it rejects
     * `capability_removed` and posts nothing.
     */
    sendToClaude(
      target: comments.SendToClaudeTarget,
    ): Promise<comments.SendToClaudeResult>;

    /**
     * Whether {@link Comments.sendToClaude} can go through for this viewer
     * right now (see {@link comments.CanSendToClaude}). Call it before
     * rendering a "Send to Claude" control and enable the control only on
     * `"available"`; on any other value, or any rejection (where the
     * platform predates this method it rejects `capability_removed`),
     * hide it or show it disabled with the reason. Posts nothing, never
     * prompts, and is cheap to call on each render of the control; the
     * answer can change after load (watching Claude sessions are learned
     * asynchronously), so re-check when (re)showing the control.
     */
    canSendToClaude(): Promise<comments.CanSendToClaude>;

    /**
     * Mark a thread resolved (`resolved: true`) or reopen it (`false`).
     * Runs with the viewer's own moderation reach: a viewer who could not
     * resolve this thread from the shell cannot resolve it from the page
     * either (rejects `forbidden`). Idempotent — resolving an
     * already-resolved thread succeeds with no change.
     */
    resolve(threadId: string, resolved: boolean): Promise<void>;

    /**
     * Delete a thread and every reply in it. IRREVERSIBLE, and it runs
     * with the viewer's full moderation reach — a viewer who may delete
     * other people's threads from the shell deletes them from here too.
     * Offer it only behind a deliberate, confirmed viewer action on one
     * named thread; never call it in bulk, on load, or from page logic
     * the viewer did not directly trigger.
     */
    delete(threadId: string): Promise<void>;
  }
}

interface ClaudeCapabilityMap {
  comments: Claude.Comments;
}
