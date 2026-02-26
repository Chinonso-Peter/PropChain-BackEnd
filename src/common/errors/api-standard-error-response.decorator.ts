import { applyDecorators } from '@nestjs/common';
import { ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto } from './error.dto';

export const ApiStandardErrorResponse = (statusCodes: number[]) => {
    const responses = statusCodes.map((status) =>
        ApiResponse({
            status,
            description: `Standardized Error Response (${status})`,
            schema: {
                $ref: getSchemaPath(ErrorResponseDto),
            },
        }),
    );

    return applyDecorators(...responses);
};
