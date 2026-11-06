// Re-embed source after edits. Keeps the deployed API and Lambda logical IDs stable.
const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'template.json'),t=JSON.parse(fs.readFileSync(file));
t.Description='Smart Dive iPhone/G2 AI Dive and explicit-confirmation reservation PoC';
t.Resources.Function.Properties.Code.ZipFile=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
t.Resources.Function.Properties.Environment={Variables:{OPERATIONS_TABLE:{Ref:'Operations'},AI_FUNCTION:{Ref:'AIFunction'}}};
t.Resources.Operations={Type:'AWS::DynamoDB::Table',Properties:{BillingMode:'PAY_PER_REQUEST',AttributeDefinitions:[{AttributeName:'pk',AttributeType:'S'}],KeySchema:[{AttributeName:'pk',KeyType:'HASH'}],TimeToLiveSpecification:{AttributeName:'ttl',Enabled:true},SSESpecification:{SSEEnabled:true}}};
const policies=t.Resources.Role.Properties.Policies;
const permission={PolicyName:'ReservationOperations',PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['dynamodb:GetItem','dynamodb:PutItem'],Resource:{'Fn::GetAtt':['Operations','Arn']}}]}};
const i=policies.findIndex(x=>x.PolicyName===permission.PolicyName);if(i>=0)policies[i]=permission;else policies.push(permission);
t.Resources.Api.Properties.CorsConfiguration.AllowMethods=['GET','POST'];
t.Resources.Api.Properties.CorsConfiguration.AllowHeaders=['authorization','content-type'];
for(const [key,route] of Object.entries({FavoritesRoute:'GET /favorites',PrepareRoute:'POST /reservation/prepare',ConfirmRoute:'POST /reservation/confirm',DiveRoute:'POST /dive',DiveResultRoute:'GET /dive'})){
 t.Resources[key]=JSON.parse(JSON.stringify(t.Resources.Route));t.Resources[key].Properties.RouteKey=route;
 t.Resources[key+'Permission']=JSON.parse(JSON.stringify(t.Resources.Permission));
 t.Resources[key+'Permission'].Properties.SourceArn={'Fn::Sub':'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/*/'+route.replace(' ','')};
}
const sub=x=>({'Fn::Sub':x}),get=(r,a)=>({'Fn::GetAtt':[r,a]});
const profile=sub('arn:${AWS::Partition}:bedrock:ap-northeast-1:${AWS::AccountId}:inference-profile/jp.amazon.nova-2-lite-v1:0');
t.Resources.AILogGroup={Type:'AWS::Logs::LogGroup',Properties:{LogGroupName:sub('/aws/lambda/${AWS::StackName}-ai'),RetentionInDays:1}};
t.Resources.AIRole={Type:'AWS::IAM::Role',Properties:{AssumeRolePolicyDocument:t.Resources.Role.Properties.AssumeRolePolicyDocument,Policies:[
 {PolicyName:'AILogs',PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['logs:CreateLogStream','logs:PutLogEvents'],Resource:sub('arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/${AWS::StackName}-ai:*')}]}},
 {PolicyName:'AIJobRecords',PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['dynamodb:GetItem','dynamodb:PutItem'],Resource:get('Operations','Arn'),Condition:{'ForAllValues:StringLike':{'dynamodb:LeadingKeys':['ai:*']}}}]}},
 {PolicyName:'Nova2LiteOnly',PolicyDocument:{Version:'2012-10-17',Statement:[
  {Effect:'Allow',Action:['bedrock:InvokeModel'],Resource:profile},
  {Effect:'Allow',Action:['bedrock:InvokeModel'],Resource:['ap-northeast-1','ap-northeast-3'].map(r=>sub('arn:${AWS::Partition}:bedrock:'+r+'::foundation-model/amazon.nova-2-lite-v1:0')),Condition:{StringEquals:{'bedrock:InferenceProfileArn':profile}}}
 ]}}
]}};
t.Resources.AIFunction={Type:'AWS::Lambda::Function',DependsOn:'AILogGroup',Properties:{FunctionName:sub('${AWS::StackName}-ai'),Runtime:'nodejs22.x',Handler:'index.aiHandler',Timeout:90,MemorySize:256,Role:get('AIRole','Arn'),Environment:{Variables:{OPERATIONS_TABLE:{Ref:'Operations'}}},Code:t.Resources.Function.Properties.Code}};
t.Resources.AIAsync={Type:'AWS::Lambda::EventInvokeConfig',Properties:{FunctionName:{Ref:'AIFunction'},Qualifier:'$LATEST',MaximumRetryAttempts:0,MaximumEventAgeInSeconds:60}};
const dispatch={PolicyName:'DispatchAIWorker',PolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['lambda:InvokeFunction'],Resource:get('AIFunction','Arn')}]}};
const d=policies.findIndex(x=>x.PolicyName===dispatch.PolicyName);if(d>=0)policies[d]=dispatch;else policies.push(dispatch);
fs.writeFileSync(file,JSON.stringify(t,null,2)+'\n');
t.Parameters={...(t.Parameters||{}),WebOrigin:{Type:'String',Default:'',AllowedPattern:'^(|https://[a-z0-9]+\\.cloudfront\\.net)$',Description:'Fixed public cockpit HTTPS origin'}};
t.Conditions={...(t.Conditions||{}),HasWebOrigin:{'Fn::Not':[{'Fn::Equals':[{Ref:'WebOrigin'},'']}]}};
t.Resources.Api.Properties.CorsConfiguration.AllowOrigins={'Fn::If':['HasWebOrigin',['http://127.0.0.1:8898',{Ref:'WebOrigin'}],['http://127.0.0.1:8898']]};
for(const [key,route] of Object.entries({PairRoute:'POST /pair',PairResultRoute:'GET /pair'})){
 t.Resources[key]=JSON.parse(JSON.stringify(t.Resources.Route));t.Resources[key].Properties.RouteKey=route;
 t.Resources[key+'Permission']=JSON.parse(JSON.stringify(t.Resources.Permission));t.Resources[key+'Permission'].Properties.SourceArn={'Fn::Sub':'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/*/'+route.replace(' ','')};
}
fs.writeFileSync(file,JSON.stringify(t,null,2)+'\n');
