import { ApiProperty } from '@nestjs/swagger';

export class PresenceOnlineResponseDto {
  @ApiProperty({
    description: 'Estimated number of online visitors in the active heartbeat window.',
    example: 127,
  })
  online: number;
}
