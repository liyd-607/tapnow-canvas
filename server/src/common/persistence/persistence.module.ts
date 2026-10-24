import { Global, Module } from '@nestjs/common';
import { ResultPersistenceService } from './result-persistence.service';

@Global()
@Module({
  providers: [ResultPersistenceService],
  exports: [ResultPersistenceService],
})
export class PersistenceModule {}
