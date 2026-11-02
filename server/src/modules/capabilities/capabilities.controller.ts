import { Controller, Get } from '@nestjs/common';
import { CapabilitiesService } from './capabilities.service';

@Controller('capabilities')
export class CapabilitiesController {
  constructor(private readonly capabilitiesService: CapabilitiesService) {}

  /**
   * 获取服务端下发的模型能力配置
   * GET /api/capabilities
   */
  @Get()
  get() {
    return this.capabilitiesService.getCapabilities();
  }
}
