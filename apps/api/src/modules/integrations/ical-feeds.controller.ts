import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { CurrentUserService } from '../users/current-user.service';
import { IcalFeedsService } from './ical-feeds.service';
import { parseSourceParam } from './integrations.service';

class CreateFeedDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  url: string;

  @IsUUID()
  propertyId: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  unitId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalPropertyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalUnitId?: string;
}

class UpdateFeedDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  unitId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** iCal calendar feeds, e.g. /integrations/booking/feeds */
@Controller('integrations/:source/feeds')
export class IcalFeedsController {
  constructor(
    private readonly feeds: IcalFeedsService,
    private readonly currentUser: CurrentUserService,
  ) {}

  @Get()
  list(@Param('source') source: string) {
    return this.feeds.list(parseSourceParam(source));
  }

  @Post()
  async create(@Param('source') source: string, @Body() dto: CreateFeedDto) {
    return this.feeds.create(parseSourceParam(source), dto, await this.currentUser.id());
  }

  /** Deletes the link, its room mapping and the reservations it imported. */
  @Delete(':id')
  async remove(@Param('source') source: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.feeds.remove(parseSourceParam(source), id, await this.currentUser.id());
  }

  @Patch(':id')
  async update(
    @Param('source') source: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeedDto,
  ) {
    parseSourceParam(source);
    return this.feeds.update(id, dto, await this.currentUser.id());
  }
}
