import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  chequeActionSchema,
  chequeCreateSchema,
  chequeListQuerySchema,
  contractCreateSchema,
  contractListQuerySchema,
  contractPaymentSchema,
  contractStatusSchema,
  contractUpdateSchema,
  dueListQuerySchema,
  installmentUpdateSchema,
  safteActionSchema,
  safteCreateSchema,
  type ChequeActionInput,
  type ChequeCreateInput,
  type ChequeListQuery,
  type ContractCreateInput,
  type ContractListQuery,
  type ContractPaymentInput,
  type ContractStatusInput,
  type ContractUpdateInput,
  type DueListQuery,
  type InstallmentUpdateInput,
  type SafteActionInput,
  type SafteInput,
} from '@iphoneha/shared';
import { AdminAuthGuard, PermissionsGuard } from '../../common/guards';
import { Client, CurrentAdmin, RequirePermissions } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/zod-validation.pipe';
import type { ClientInfo } from '../../common/utils';
import type { AuthAdmin } from '../../types/express';
import { LedgerService } from './ledger.service';

/** «دفتر اقساط»: the store's own cheque and promissory-note instalment sales. */
@ApiTags('admin-ledger')
@Controller('admin/ledger')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('summary')
  @RequirePermissions('installments.read')
  summary() {
    return this.ledger.summary();
  }

  /** Open instalments due soon, overdue ones first. */
  @Get('dues')
  @RequirePermissions('installments.read')
  dues(@Query(new ZodQuery(dueListQuerySchema)) query: DueListQuery) {
    return this.ledger.dues(query);
  }

  @Get('cheques')
  @RequirePermissions('installments.read')
  cheques(@Query(new ZodQuery(chequeListQuerySchema)) query: ChequeListQuery) {
    return this.ledger.cheques(query);
  }

  @Get('contracts')
  @RequirePermissions('installments.read')
  list(@Query(new ZodQuery(contractListQuerySchema)) query: ContractListQuery) {
    return this.ledger.list(query);
  }

  @Post('contracts')
  @RequirePermissions('installments.write')
  create(
    @Body(new ZodBody(contractCreateSchema)) body: ContractCreateInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.ledger.create(body, admin, client);
  }

  /** By id, or by the contract's number. */
  @Get('contracts/:id')
  @RequirePermissions('installments.read')
  get(@Param('id') id: string) {
    return this.ledger.get(id);
  }

  @Patch('contracts/:id')
  @RequirePermissions('installments.write')
  update(
    @Param('id') id: string,
    @Body(new ZodBody(contractUpdateSchema)) body: ContractUpdateInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.ledger.update(id, body, admin, client);
  }

  @Post('contracts/:id/status')
  @RequirePermissions('installments.write')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodBody(contractStatusSchema)) body: ContractStatusInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.ledger.setStatus(id, body, admin, client);
  }

  @Post('contracts/:id/payments')
  @RequirePermissions('installments.write')
  recordPayment(
    @Param('id') id: string,
    @Body(new ZodBody(contractPaymentSchema)) body: ContractPaymentInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.ledger.recordPayment(id, body, admin, client);
  }

  @Post('payments/:id/void')
  @RequirePermissions('installments.write')
  voidPayment(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin, @Client() client: ClientInfo) {
    return this.ledger.voidPayment(id, admin, client);
  }

  @Patch('installments/:id')
  @RequirePermissions('installments.write')
  updateInstallment(
    @Param('id') id: string,
    @Body(new ZodBody(installmentUpdateSchema)) body: InstallmentUpdateInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.ledger.updateInstallment(id, body, admin, client);
  }

  @Post('installments/:id/remind')
  @RequirePermissions('installments.write')
  remind(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin, @Client() client: ClientInfo) {
    return this.ledger.sendReminder(id, admin, client);
  }

  @Post('contracts/:id/cheques')
  @RequirePermissions('installments.write')
  addCheque(
    @Param('id') id: string,
    @Body(new ZodBody(chequeCreateSchema)) body: ChequeCreateInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.ledger.addCheque(id, body, admin, client);
  }

  @Post('cheques/:id/action')
  @RequirePermissions('installments.write')
  chequeAction(
    @Param('id') id: string,
    @Body(new ZodBody(chequeActionSchema)) body: ChequeActionInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.ledger.chequeAction(id, body, admin, client);
  }

  @Post('contracts/:id/saftes')
  @RequirePermissions('installments.write')
  addSafte(
    @Param('id') id: string,
    @Body(new ZodBody(safteCreateSchema)) body: SafteInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.ledger.addSafte(id, body, admin, client);
  }

  @Post('saftes/:id/action')
  @RequirePermissions('installments.write')
  safteAction(
    @Param('id') id: string,
    @Body(new ZodBody(safteActionSchema)) body: SafteActionInput,
    @CurrentAdmin() admin: AuthAdmin,
    @Client() client: ClientInfo,
  ) {
    return this.ledger.safteAction(id, body, admin, client);
  }
}
