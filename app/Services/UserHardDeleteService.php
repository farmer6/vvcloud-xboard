<?php

namespace App\Services;

use App\Models\CommissionLog;
use App\Models\GiftCardCode;
use App\Models\GiftCardUsage;
use App\Models\Order;
use App\Models\TicketMessage;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class UserHardDeleteService
{
    /**
     * Hard-delete a user and clean up/detach the data that can be safely changed.
     *
     * @return array<string, mixed>
     */
    public function handle(User $user): array
    {
        return DB::transaction(function () use ($user): array {
            $ticketIds = $user->tickets()->pluck('id')->all();

            $summary = [
                'mode' => 'hard_delete',
                'user' => [
                    'id' => $user->id,
                    'email' => $user->email,
                ],
                'deleted' => [
                    'personal_access_tokens' => $this->deletePersonalAccessTokens($user),
                    'ticket_messages' => $this->deleteTicketMessages($user->id, $ticketIds),
                    'tickets' => $user->tickets()->delete(),
                    'orders' => $user->orders()->delete(),
                    'invite_codes' => $user->codes()->delete(),
                    'stat_records' => $user->stat()->delete(),
                    'traffic_reset_logs' => $this->deleteTrafficResetLogs($user),
                ],
                'detached' => [
                    'invited_users' => User::where('invite_user_id', $user->id)->update(['invite_user_id' => null]),
                    'child_users' => User::where('parent_id', $user->id)->update(['parent_id' => null]),
                    'invited_orders' => Order::where('invite_user_id', $user->id)->update(['invite_user_id' => null]),
                    'gift_card_code_user_refs' => $this->detachGiftCardCodeUserRefs($user),
                    'gift_card_usage_invite_refs' => $this->detachGiftCardUsageInviteRefs($user),
                ],
                'preserved' => [
                    'commission_logs_as_buyer' => $this->countCommissionLogsAsBuyer($user),
                    'commission_logs_as_inviter' => $this->countCommissionLogsAsInviter($user),
                    'gift_card_usages_as_user' => $this->countGiftCardUsagesAsUser($user),
                ],
                'notes' => [
                    'v2_commission_log is preserved because it is treated as historical payout/ledger data.',
                    'v2_gift_card_usage.user_id is preserved because the column is non-nullable and acts as a redemption history record.',
                    'Nullable external references are detached before deleting v2_user to avoid leaving broken inviter/parent links.',
                ],
            ];

            $summary['deleted']['user'] = (int) $user->delete();

            return $summary;
        });
    }

    /**
     * Delete messages posted by the user, plus admin replies inside the user's tickets.
     *
     * @param array<int, int> $ticketIds
     */
    private function deleteTicketMessages(int $userId, array $ticketIds): int
    {
        $query = TicketMessage::query()->where('user_id', $userId);

        if ($ticketIds !== []) {
            $query->orWhereIn('ticket_id', $ticketIds);
        }

        return $query->delete();
    }

    private function deletePersonalAccessTokens(User $user): int
    {
        if (!Schema::hasTable('personal_access_tokens')) {
            return 0;
        }

        return $user->tokens()->delete();
    }

    private function deleteTrafficResetLogs(User $user): int
    {
        if (!Schema::hasTable('v2_traffic_reset_logs')) {
            return 0;
        }

        return $user->trafficResetLogs()->delete();
    }

    private function detachGiftCardCodeUserRefs(User $user): int
    {
        if (!Schema::hasTable('v2_gift_card_code')) {
            return 0;
        }

        return GiftCardCode::where('user_id', $user->id)->update(['user_id' => null]);
    }

    private function detachGiftCardUsageInviteRefs(User $user): int
    {
        if (!Schema::hasTable('v2_gift_card_usage')) {
            return 0;
        }

        return GiftCardUsage::where('invite_user_id', $user->id)->update(['invite_user_id' => null]);
    }

    private function countCommissionLogsAsBuyer(User $user): int
    {
        if (!Schema::hasTable('v2_commission_log')) {
            return 0;
        }

        return CommissionLog::where('user_id', $user->id)->count();
    }

    private function countCommissionLogsAsInviter(User $user): int
    {
        if (!Schema::hasTable('v2_commission_log')) {
            return 0;
        }

        return CommissionLog::where('invite_user_id', $user->id)->count();
    }

    private function countGiftCardUsagesAsUser(User $user): int
    {
        if (!Schema::hasTable('v2_gift_card_usage')) {
            return 0;
        }

        return GiftCardUsage::where('user_id', $user->id)->count();
    }
}
