import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_CONFIG, loadConfig } from './config/app-config';
import { Clock, SystemClock } from './infrastructure/clock';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { AuditService } from './modules/audit/audit.service';
import { CalendarController } from './modules/calendar/calendar.controller';
import { CalendarService } from './modules/calendar/calendar.service';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { HealthController } from './modules/health/health.controller';
import { IcalFeedsController } from './modules/integrations/ical-feeds.controller';
import { IcalFeedsService } from './modules/integrations/ical-feeds.service';
import { IntegrationsController } from './modules/integrations/integrations.controller';
import { IntegrationsService } from './modules/integrations/integrations.service';
import { MappingsController } from './modules/mappings/mappings.controller';
import { MappingsService } from './modules/mappings/mappings.service';
import { PropertiesController } from './modules/properties/properties.controller';
import { PropertiesService } from './modules/properties/properties.service';
import { ConflictsService } from './modules/reservations/conflicts.service';
import { ReservationsController } from './modules/reservations/reservations.controller';
import { ReservationsService } from './modules/reservations/reservations.service';
import { SyncService } from './modules/sync/sync.service';
import { SyncsController } from './modules/sync/syncs.controller';
import { UnitsController } from './modules/units/units.controller';
import { UnitsService } from './modules/units/units.service';
import { CurrentUserService } from './modules/users/current-user.service';

/** Cross-cutting infrastructure shared by every feature module. */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Values already in the environment win over the .env file.
      envFilePath: ['.env'],
      validate: (raw) => {
        loadConfig(raw);
        return raw;
      },
    }),
  ],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig(process.env) },
    { provide: Clock, useClass: SystemClock },
    PrismaService,
    AuditService,
    CurrentUserService,
  ],
  exports: [APP_CONFIG, Clock, PrismaService, AuditService, CurrentUserService],
})
export class CoreModule {}

@Module({ controllers: [PropertiesController, UnitsController], providers: [PropertiesService, UnitsService] })
export class PropertiesModule {}

@Module({ providers: [ConflictsService], exports: [ConflictsService] })
export class ConflictsModule {}

@Module({ imports: [ConflictsModule], controllers: [ReservationsController], providers: [ReservationsService] })
export class ReservationsModule {}

@Module({ imports: [ConflictsModule], controllers: [CalendarController], providers: [CalendarService] })
export class CalendarModule {}

@Module({ imports: [ConflictsModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}

@Module({ providers: [MappingsService], controllers: [MappingsController], exports: [MappingsService] })
export class MappingsModule {}

@Module({
  imports: [MappingsModule],
  controllers: [IntegrationsController, IcalFeedsController, SyncsController],
  providers: [SyncService, IntegrationsService, IcalFeedsService],
})
export class IntegrationsModule {}

@Module({
  imports: [
    CoreModule,
    PropertiesModule,
    ReservationsModule,
    CalendarModule,
    DashboardModule,
    MappingsModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
