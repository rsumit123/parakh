import { Modal } from "./Modal";

interface Props {
  open: boolean;
  isGuest: boolean;
  onClose: () => void;
  onSignIn: () => void;
}

/** Friendly "daily scan limit reached" dialog. Guests are nudged to sign in for a
 *  higher limit; signed-in users are told to come back tomorrow. */
export function LimitModal({ open, isGuest, onClose, onSignIn }: Props) {
  if (isGuest) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        icon="🚦"
        title="You've used today's free scans"
        body="Guests get 3 scans a day. Sign in with your email to unlock 10 scans every day — your history stays with you."
        primaryLabel="Sign in for more"
        onPrimary={onSignIn}
        secondaryLabel="Maybe later"
      />
    );
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="🌙"
      title="That's all for today"
      body="You've used all 10 of today's scans. Your limit resets tomorrow — see you then!"
      primaryLabel="Got it"
      onPrimary={onClose}
    />
  );
}
