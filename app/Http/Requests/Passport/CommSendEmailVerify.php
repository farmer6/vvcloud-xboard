<?php

namespace App\Http\Requests\Passport;

use Illuminate\Foundation\Http\FormRequest;

class CommSendEmailVerify extends FormRequest
{
    public function rules()
    {
        return [
            // required：必须提交
            // email:strict：严格邮箱格式
            // not_regex:/[A-Z]/：禁止出现任意大写字母（A-Z）
            'email' => 'required|email:strict|not_regex:/[A-Z]/',
        ];
    }

    public function messages()
    {
        return [
            'email.required'  => '邮箱不能为空',
            'email.email'     => '邮箱格式不正确',
            'email.not_regex' => '邮箱地址不能包含大写字母，请全部使用小写后再试',
        ];
    }
}
