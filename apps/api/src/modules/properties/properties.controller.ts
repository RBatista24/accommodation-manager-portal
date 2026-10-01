import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUserService } from '../users/current-user.service';
import { UnitsService } from '../units/units.service';
import { PropertiesService } from './properties.service';

class ListPropertiesQuery {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}

class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

class UpdatePropertyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly properties: PropertiesService,
    private readonly units: UnitsService,
    private readonly currentUser: CurrentUserService,
  ) {}

  @Get()
  list(@Query() query: ListPropertiesQuery) {
    return this.properties.list(query.includeInactive ?? false);
  }

  @Post()
  async create(@Body() dto: CreatePropertyDto) {
    return this.properties.create(dto, await this.currentUser.id());
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.properties.get(id);
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePropertyDto) {
    return this.properties.update(id, dto, await this.currentUser.id());
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.properties.setActive(id, false, await this.currentUser.id());
  }

  @Post(':id/activate')
  @HttpCode(200)
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.properties.setActive(id, true, await this.currentUser.id());
  }

  /** Permanent. Only for deactivated properties; removes units, reservations and mappings too. */
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.properties.remove(id, await this.currentUser.id());
  }

  @Get(':id/units')
  listUnits(@Param('id', ParseUUIDPipe) id: string, @Query() query: ListPropertiesQuery) {
    return this.units.listForProperty(id, query.includeInactive ?? true);
  }

  @Post(':id/units')
  async createUnit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateUnitDto) {
    return this.units.create(id, dto, await this.currentUser.id());
  }
}
