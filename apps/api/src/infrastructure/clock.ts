import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { todayIn, type IsoDate } from '../domain/dates';

/** The only place that reads the current time, so tests can control it. */
export abstract class Clock {
  abstract now(): Date;
  abstract today(): IsoDate;
}

@Injectable()
export class SystemClock extends Clock {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  now(): Date {
    return new Date();
  }

  today(): IsoDate {
    return todayIn(this.config.timezone, this.now());
  }
}

export class FixedClock extends Clock {
  constructor(
    private readonly fixedToday: IsoDate,
    private readonly fixedNow: Date = new Date(`${fixedToday}T12:00:00.000Z`),
  ) {
    super();
  }

  now(): Date {
    return this.fixedNow;
  }

  today(): IsoDate {
    return this.fixedToday;
  }
}
