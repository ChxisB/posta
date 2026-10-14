/** How long the transient "✓ Saved" stays beside the Save button after a save. */
export const SAVED_FLASH_MS = 2100;

/** Its fade-out, timed to finish just before the status unmounts. */
export const SAVED_FADE = { ms: 240, delayMs: 1800 } as const;

/** The fade-out as a CSS animation: the shared fade-in, played backwards. */
export const SAVED_FADE_ANIMATION = `po-fade ${SAVED_FADE.ms}ms var(--po-ease) ${SAVED_FADE.delayMs}ms reverse both`;
