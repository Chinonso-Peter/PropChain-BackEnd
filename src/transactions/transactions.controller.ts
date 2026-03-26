import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto, DisputeDto } from './dto/create-transaction.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiResponse({ status: 201, description: 'Transaction created successfully.', type: CreateTransactionDto })
  @ApiResponse({ status: 400, description: 'Invalid transaction data.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  create(@Body() dto: CreateTransactionDto) {
    return this.service.createTransaction(dto);
  }

  @Post(':id/escrow')
  @ApiOperation({ summary: 'Fund escrow for a transaction' })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Escrow funded successfully.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  fundEscrow(@Param('id') id: string) {
    return this.service.fundEscrow(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Transaction found.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  findOne(@Param('id') id: string) {
    return this.service.getTransaction(id);
  }

  @Get()
  @ApiOperation({ summary: 'List transactions with filters' })
  @ApiResponse({ status: 200, description: 'List of transactions.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  findAll(@Query() query: TransactionQueryDto) {
    return this.service.findAll(query);
  }

  @Post(':id/dispute')
  @ApiOperation({ summary: 'Raise a dispute for a transaction' })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Dispute raised successfully.', type: DisputeDto })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  dispute(@Param('id') id: string, @Body() dto: DisputeDto) {
    return this.service.raiseDispute(id, dto);
  }
}
