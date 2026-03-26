import { Global, Module } from '@nestjs/common';
import { BoundaryValidationService } from './boundary-validation.service';

@Global()
@Module({
  providers: [BoundaryValidationService],
  exports: [BoundaryValidationService],
})
export class BoundaryValidationModule {}
