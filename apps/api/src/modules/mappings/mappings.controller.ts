import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { RESERVATION_SOURCES, type ReservationSource } from '../../domain/reservation';
import { CurrentUserService } from '../users/current-user.service';
import { MappingsService } from './mappings.service';

class ListMappingsQuery {
  @IsOptional()
  @IsIn(RESERVATION_SOURCES)
  source?: ReservationSource;
}

class CreateMappingDto {
  @IsIn(RESERVATION_SOURCES)
  source: ReservationSource;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  externalPropertyId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  externalUnitId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalName?: string;

  @IsUUID()
  propertyId: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  unitId?: string | null;
}

class UpdateMappingDto {
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  unitId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalName?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Links between external properties/rooms (e.g. Booking) and local Properties/Units. */
@Controller('mappings')
export class MappingsController {
  constructor(
    private readonly mappings: MappingsService,
    private readonly currentUser: CurrentUserService,
  ) {}

  @Get()
  list(@Query() query: ListMappingsQuery) {
    return this.mappings.list(query.source);
  }

  @Post()
  async create(@Body() dto: CreateMappingDto) {
    return this.mappings.create(dto, await this.currentUser.id());
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMappingDto) {
    return this.mappings.update(id, dto, await this.currentUser.id());
  }
}
