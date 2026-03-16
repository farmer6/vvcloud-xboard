<?php

namespace App\Http\Routes\V2;

use App\Http\Controllers\V2\Ops\UserHardDeleteController;
use Illuminate\Contracts\Routing\Registrar;

class OpsRoute
{
    public function map(Registrar $router): void
    {
        $router->group([
            'prefix' => 'ops',
            'middleware' => ['log'],
        ], function ($router) {
            $router->post('/user/hardDelete', [UserHardDeleteController::class, 'handle']);
        });
    }
}
