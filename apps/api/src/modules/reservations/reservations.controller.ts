import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import {
  RESERVATION_KINDS,
  RESERVATION_SOURCES,
  RESERVATION_STATUSES,
  type ReservationKind,
  type ReservationSource,
  type ReservationStatus,
} from '../../domain/reservation';
import { CurrentUserService } from '../users/current-user.service';
import { ConflictsService } from './conflicts.service';
import { ReservationsService } from './reservations.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const toBool = ({ value }: { value: unknown }) => value === 'true' || value === true;

class ListReservationsQuery {
  @IsOptional() @IsUUID() propertyId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsIn(RESERVATION_SOURCES) source?: ReservationSource;
  @IsOptional() @IsIn(RESERVATION_STATUSES) status?: ReservationStatus;
  @IsOptional() @IsIn(RESERVATION_KINDS) kind?: ReservationKind;
  @IsOptional() @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' }) from?: string;
  @IsOptional() @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' }) to?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() unassigned?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() conflicts?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

class ConflictsQuery {
  @IsOptional() @IsUUID() propertyId?: string;
  @IsOptional() @Matches(ISO_DATE) from?: string;
  @IsOptional() @Matches(ISO_DATE) to?: string;
}

class EditReservationDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(200) guestName?: string | null;
  // Empty string clears the field; anything else must be an e-mail.
  @IsOptional() @ValidateIf((_o, v) => v !== null && v !== '') @IsEmail() @MaxLength(200) guestEmail?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(50) guestPhone?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(1) @Max(100) numberOfGuests?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(4000) notes?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(200) billingName?: string | null;
  // NIF or VAT number: letters, digits and separators (removed on save); empty clears it.
  @IsOptional() @ValidateIf((_o, v) => v !== null && v !== '') @IsString() @Matches(/^[A-Za-z0-9\s./-]{4,40}$/, { message: 'Enter a valid NIF or VAT number (letters and digits only)' }) billingNif?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(500) billingAddress?: string | null;
  // Stay fields: only accepted for reservations created in the app (checked by the service).
  @IsOptional() @Matches(ISO_DATE, { message: 'checkIn must be YYYY-MM-DD' }) checkIn?: string;
  @IsOptional() @Matches(ISO_DATE, { message: 'checkOut must be YYYY-MM-DD' }) checkOut?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsBoolean() acceptConflicts?: boolean;
}

/** A reservation typed in by a person (source DIRECT). */
class CreateReservationDto {
  @IsUUID() propertyId: string;
  @IsUUID() unitId: string;
  @Matches(ISO_DATE, { message: 'checkIn must be YYYY-MM-DD' }) checkIn: string;
  @Matches(ISO_DATE, { message: 'checkOut must be YYYY-MM-DD' }) checkOut: string;
  @IsOptional() @IsIn(RESERVATION_KINDS) kind?: ReservationKind;
  // Required for a guest stay (checked by the service); not used for blocked dates.
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(200) guestName?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null && v !== '') @IsEmail() @MaxLength(200) guestEmail?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(50) guestPhone?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(1) @Max(100) numberOfGuests?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(4000) notes?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(200) billingName?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null && v !== '') @IsString() @Matches(/^[A-Za-z0-9\s./-]{4,40}$/, { message: 'Enter a valid NIF or VAT number (letters and digits only)' }) billingNif?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(500) billingAddress?: string | null;
  @IsOptional() @IsBoolean() acceptConflicts?: boolean;
}

class SetKindDto {
  @IsIn(RESERVATION_KINDS) kind: ReservationKind;
}

class AssignUnitDto {
  @IsUUID()
  unitId: string;
}

@Controller()
export class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly conflicts: ConflictsService,
    private readonly currentUser: CurrentUserService,
  ) {}

  @Get('reservations')
  list(@Query() query: ListReservationsQuery) {
    return this.reservations.list(query);
  }

  @Get('reservations/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.get(id);
  }

  /** Create a reservation by hand (source DIRECT). 409 + overlapping stays unless acceptConflicts. */
  @Post('reservations')
  async create(@Body() dto: CreateReservationDto) {
    return this.reservations.create(dto, await this.currentUser.id());
  }

  /** Mark as blocked dates or as a guest stay (any source; sync never changes it). */
  @Post('reservations/:id/kind')
  @HttpCode(200)
  async setKind(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetKindDto) {
    return this.reservations.setKind(id, dto.kind, await this.currentUser.id());
  }

  /** Cancel a reservation created in the app (never deleted). */
  @Post('reservations/:id/cancel')
  @HttpCode(200)
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.cancel(id, await this.currentUser.id());
  }

  /** Fill in guest details, notes and billing; dates and unit only for DIRECT reservations. */
  @Patch('reservations/:id')
  async edit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditReservationDto) {
    return this.reservations.edit(id, dto, await this.currentUser.id());
  }

  @Post('reservations/:id/assign-unit')
  @HttpCode(200)
  async assignUnit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignUnitDto) {
    return this.reservations.assignUnit(id, dto.unitId, await this.currentUser.id());
  }

  /** Current and future conflicts by default. */
  @Get('conflicts')
  listConflicts(@Query() query: ConflictsQuery) {
    return this.conflicts.find({
      propertyId: query.propertyId,
      from: query.from ?? this.reservations.today(),
      to: query.to,
    });
  }
}
