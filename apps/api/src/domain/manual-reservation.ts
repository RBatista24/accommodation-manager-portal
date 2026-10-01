import { isIsoDate, type IsoDate } from './dates';

/** What a person types to create a reservation by hand (source DIRECT). */
export interface ManualStayInput {
  checkIn: IsoDate;
  checkOut: IsoDate;
  guestName: string;
  numberOfGuests?: number | null;
}

/** Plain-language problems with a manual stay; empty when valid. */
export function validateManualStay(input: ManualStayInput): string[] {
  const problems: string[] = [];
  if (!isIsoDate(input.checkIn)) problems.push('Choose a valid check-in date');
  if (!isIsoDate(input.checkOut)) problems.push('Choose a valid check-out date');
  if (isIsoDate(input.checkIn) && isIsoDate(input.checkOut) && input.checkOut <= input.checkIn) {
    problems.push('Check-out must be after check-in');
  }
  if (!input.guestName || input.guestName.trim() === '') problems.push('Enter the guest name');
  const g = input.numberOfGuests;
  if (g !== undefined && g !== null && (!Number.isInteger(g) || g < 1 || g > 100)) {
    problems.push('Number of guests must be between 1 and 100');
  }
  return problems;
}
