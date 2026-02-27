<?php

namespace App\Payments;

class NomiPay
{
    private $pid;
    private $key;
    private $url;

    
    public function __construct($config)
    {
        $this->config = $config;
    }
    public function form()
    {
        return [
            'pid' => [
                'label' => '易支付PID',
                'description' => '',
                'type' => 'input',
            ],
            'key' => [
                'label' => '易支付KEY',
                'description' => '',
                'type' => 'input',
            ],
            'type' => [
                'label' => '支付通道可选|alipay|wxpay|usdtpay',
                'description' => '',
                'type' => 'input',
            ],
            'url' => [
                'label' => '易支付URL',
                'description' => '',
                'type' => 'input',
            ]
        ];
    }
    public function curl_get($url)
    {
    	$ch = curl_init($url);
    	$httpheader[] = 'Accept:*/*';
    	$httpheader[] = 'Accept-Language:zh-CN,zh;q=0.8';
    	$httpheader[] = 'Connection:close';
		$httpheader[] = 'Content-Type: application/json';
    	curl_setopt($ch, CURLOPT_HTTPHEADER, $httpheader);
    	curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    	curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    	curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    	if($this->checkmobile()==true){
    	    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Linux; U; Android 4.4.1; zh-cn; R815T Build/JOP40D) AppleWebKit/533.1 (KHTML, like Gecko)Version/4.0 MQQBrowser/4.5 Mobile Safari/533.1');
    	}
    	curl_setopt($ch, CURLOPT_FOLLOWLOCATION ,1);
    	curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    	$content = curl_exec($ch);
    	curl_close($ch);
    	return $content;
    }
    public function pay($order)
    {
        
        
		$para = [
            'money' => $order['total_amount'] / 100,
            'name' => $order['trade_no'],
            'notify_url' => $order['notify_url'],
            'return_url' => $order['return_url'],
            'out_trade_no' => $order['trade_no'],
            'pid' => $this->config['pid'],
			'type' => $this->config['type']
        ];
        //除去待签名参数数组中的空值和签名参数
		$para_filter = array();
		foreach ($para as $key=>$val){
			if($key=="sign" || $key=="sign_type" || $val == "")continue;
			else $para_filter[$key] = $para[$key];
		}
		//对待签名参数数组排序
		ksort($para_filter);
		reset($para_filter);
        //把数组所有元素，按照“参数=参数值”的模式用“&”字符拼接成字符串
		$data = http_build_query($para_filter) . $this->config['key'];
    	//生成签名结果
		$mysign = md5($data);
        //签名结果与签名方式加入请求提交参数组中
		
		$para_filter['sign'] = $mysign;
        $para_filter['sign_type'] = 'MD5';
        $url = $this->config['url'] . '/submit/qrcode?' . http_build_query($para_filter);
        
        $url_json = $this->curl_get($url);
        $pay_url = json_decode($url_json,true);
		
        if($para['type']=='wxpay' && $this->checkmobile()==true)
		{
            $type = 0;
        }else{
            $type = 1;
        }
        file_put_contents('/settle_.log',var_export($pay_url,true).'----'.date("Ymd")."\r\n",FILE_APPEND);
		return [
            'type' => $type, // 0:qrcode 1:url
            'data' => $pay_url['code_url']
        ];
    }

    public function notify($para)
    {
        $sign = $para['sign'];
        $para_filter = array();
		foreach ($para as $key=>$val){
			if($key=="sign" || $key=="sign_type" || $key=="notify_url" || $val == "")continue;
			else $para_filter[$key] = $para[$key];
		}
		//对待签名参数数组排序
		ksort($para_filter);
		reset($para_filter);
		//把数组所有元素，按照“参数=参数值”的模式用“&”字符拼接成字符串
		$data = http_build_query($para_filter).$this->config['key'];
		
        //$str = stripslashes(urldecode(http_build_query($params))) . $this->key;
        
        if ($para['trade_status'] != 'TRADE_SUCCESS') return false;
        
        if ($sign !== md5($data)) {
            return false;
        }
        return [
          'trade_no' => $para_filter['out_trade_no'],
          'callback_no' => $para_filter['trade_no']
        ];
    }
    public function checkmobile()
    {
	    // 如果有HTTP_X_WAP_PROFILE则一定是移动设备
		if (isset ($_SERVER['HTTP_X_WAP_PROFILE'])) {
			return true;
		}

		if(isset ($_SERVER['HTTP_CLIENT']) &&'PhoneClient'==$_SERVER['HTTP_CLIENT']) return true;
		if (isset ($_SERVER['HTTP_VIA']) && stristr($_SERVER['HTTP_VIA'], 'wap')) return true;
		if (isset ($_SERVER['HTTP_USER_AGENT'])) {
			$clientkeywords = array(
				'nokia','sony','ericsson','mot','samsung','htc','sgh','lg','sharp','sie-','philips','panasonic','alcatel','lenovo','iphone','ipod','blackberry','meizu','android','netfront','symbian','ucweb','windowsce','palm','operamini','operamobi','openwave','nexusone','cldc','midp','wap','mobile'
			);
			if (preg_match("/(" . implode('|', $clientkeywords) . ")/i", strtolower($_SERVER['HTTP_USER_AGENT']))) {
				return true;
			}
		}
		if (isset ($_SERVER['HTTP_ACCEPT'])) {
			if ((strpos($_SERVER['HTTP_ACCEPT'],
						'vnd.wap.wml') !== false) && (strpos($_SERVER['HTTP_ACCEPT'],
						'text/html') === false || (strpos($_SERVER['HTTP_ACCEPT'],
							'vnd.wap.wml') < strpos($_SERVER['HTTP_ACCEPT'],
							'text/html')))) {
				return true;
			}
		}
		return false;
    }
}
