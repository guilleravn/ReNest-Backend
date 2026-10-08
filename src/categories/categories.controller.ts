import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoryDto } from './dto/category.dto.js';
import { CategoriesService } from './categories.service.js';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Categories, sorted by name. Public.' })
  @ApiOkResponse({ type: [CategoryDto] })
  list(): Promise<CategoryDto[]> {
    return this.categories.list();
  }
}
