import { Module } from '@nestjs/common'
import { CatalogController } from './catalog.controller'
import { CatalogService } from './catalog.service'
import { ProjectsController } from './projects.controller'

@Module({
  controllers: [CatalogController, ProjectsController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
