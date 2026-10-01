import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUserService } from '../users/current-user.service';
import { UnitsService } from './units.service';

class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

/** Listing and creating units lives under /properties/:id/units. */
@Controller('units')
export class UnitsController {
  constructor(
    private readonly units: UnitsService,
    private readonly currentUser: CurrentUserService,
  ) {}

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto) {
    return this.units.update(id, dto, await this.currentUser.id());
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.units.setActive(id, false, await this.currentUser.id());
  }

  @Post(':id/activate')
  @HttpCode(200)
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.units.setActive(id, true, await this.currentUser.id());
  }
}
