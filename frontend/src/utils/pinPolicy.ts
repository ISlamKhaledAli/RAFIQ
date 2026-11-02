// Mirrors SecurityService.IsWeakPin / ChangeUserPin rules on the C# side; the server remains authoritative.
const WEAK_PINS: readonly string[] = [
  '1234', '4321', '0000', '1111', '2222', '3333', '4444',
  '5555', '6666', '7777', '8888', '9999', '0123', '9876',
  '12345', '54321', '123456', '654321',
];

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export function isWeakPin(pin: string): boolean {
  return pin.length < 4 || WEAK_PINS.includes(pin);
}

/** A logged-in user flagged by the server must replace their PIN before reaching any screen. */
export function requiresForcedPinChange(user: { mustChangePin?: boolean } | null | undefined): boolean {
  return Boolean(user && user.mustChangePin);
}
