export type ActivityPhase="FINALIZED_SUCCESS"|"FINALIZED_ERROR"|"UNDETERMINED";

export interface OnchainActivityItem {
  label:string;
  hash:`0x${string}`;
  phase:ActivityPhase;
  execution:"FINISHED_WITH_RETURN"|"FINISHED_WITH_ERROR";
  milestone:boolean;
}

// Curated only from the checked-in Studio Next release manifests and incident evidence.
export const onchainActivityByDeal:Record<string,OnchainActivityItem[]>={
  "v2-studio-no-fault-358323c":[
    {label:"Deal created",hash:"0xb9cd8e27c78d53a3cafde2ca0584ded045756f07ab00cc91785c0c5ce69b3909",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Funded",hash:"0xc90fca8c694ef2f57a76069537ec9e583ea2f1b088443f1d092160867a7f83b0",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A accepted",hash:"0xbcd27d526a4fda341a8d2eff1284036376e383c4544241f934f7bfdfd77c2920",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Agent A submitted",hash:"0x08e8bda52eb1d092358011ce6fe66588fb62f32c511fa03d8c228cbed363a943",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B accepted",hash:"0xb72e11cd373975b7a0596e9bff09472709df4e1fc6fe2d316faff2a0ef582955",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Agent B submitted",hash:"0x381871adf14474419788f403f2cb2a2e8d3d90ed23de6210510aacc24cacfcbd",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Review requested",hash:"0xc4d6afa464a81d98fea3c56dccafd09a9a39adc2b3b10aefa20b5a5cb6b91fab",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Review resolved",hash:"0x79b6271e34dc4f8a122757936fbeb12f32896abab25460b1c0f62185103de1e5",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A payout dispatch attempt",hash:"0x3ef45717be138fff1938cbf8fc45b2c402f319eb9db117f177a242b7e919c78c",phase:"FINALIZED_ERROR",execution:"FINISHED_WITH_ERROR",milestone:false},
    {label:"Agent A payout dispatched",hash:"0x7453551caef14b18732b7476f88d4fbbb6139966475be4fddd0c2bee9b2b1dd1",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A bond return dispatched",hash:"0x9419eaccd1214f9ebb2e04a0644c5e499b65968eb70656df0996190e3b8cedae",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B payout dispatched",hash:"0xd840e3776a6a4e6b856c8e8e9b0411a392a491070c9ea7a291d2411f22d2f210",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B bond return dispatched",hash:"0x41360d47b006149b3e2b452b904cdfc0962ef956ee6712ea7d7f741edad85a0f",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
  ],
  "v2-studio-a-fault-r3-358323c":[
    {label:"Deal created",hash:"0x91db939374c8d7f161f74a7c6b38722b79271d5dee836606521bc72e50d8e990",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Funded",hash:"0x73c7458652d8c4313625fe7cbe508306fcf9b51317029a451648c2de12ea95a2",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A accepted",hash:"0x3f50b928b118de6c36c0c1074fe3315bf704e137001a4ab1b0c1082a0585ce65",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Agent A submitted",hash:"0x8063cef4099539ebacb50ec6ad7360e59a4ba6d0945180f348bea04121fc681c",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B accepted",hash:"0xcde29064140750539a4d8c257ff2e13faf2bc4e7d8617e9b15de900fd912ee29",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Agent B submitted",hash:"0xbdabcf669d8db7087d13e2335eb7327c37313a1ee6fe9d777b6485eefec5b496",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Review requested",hash:"0x8e3cfbacf4c68910414fa985ecfa04f5b6c4ab87b179bef1da56619def8901be",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Review resolved",hash:"0x3d3b69c4cb96a089cd062fc8a00eb9a3cb6a3acea656b12e1d9923c78c8a2ddc",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A refund dispatched",hash:"0x1aef433655ab49d76c63bc5a72161236c4c8b0f2867cba868c2f179939c3d04b",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A bond return dispatched",hash:"0x389711cd7c833d0a0d0da0249e768c0f118e52c4bc61f039a0f9cb6e20916b19",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B payout dispatched",hash:"0xce8f637cc9d74435898578ff5df00c0b897cbc0f7d4d3f88959673da4f9727d4",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B bond return dispatched",hash:"0x5261b05d41e9420f717c10c1bcb5b442d61dc41dcec391a72b0a04a1407fe43c",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
  ],
  "v2-studio-b-fault-358323c":[
    {label:"Deal created",hash:"0xb455fe1fc3bbb5fd8f4b41e782e1125ad10392b1440dc09700b42d08a6979484",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Funded",hash:"0x5b95ee165924e65404dc0e861febe85e266a938b360e7da624841f3709fa7c3b",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A accepted",hash:"0xf5120d38330c56699d5cc677bbd0a8c694bbdaff31537b901cce53ca680777a1",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Agent A submitted",hash:"0x7dc087c3d0c86e7b3c5a9198773aaee9ae57b48e14d04018b7ccf7657f9ab8a7",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B accepted",hash:"0xfde0d7ea6552eb0ef47000f1bc36253200a729d2d03067dd2230a137e6feb3d7",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Agent B submitted",hash:"0x8e3c0255066b1612087b5a8d6a38b2f393bd8fc5e04a346e9b01c7fe33dd7efe",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Review requested",hash:"0x24056ac5e9d7e6b00343dbea2b2271f0559f431405c748ae921ec4bf257dee3d",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Review resolution attempt 1",hash:"0xbf303857a029bbe1c55d0861b1913f49e24319a898e02e997ba892766b4f6c58",phase:"UNDETERMINED",execution:"FINISHED_WITH_ERROR",milestone:false},
    {label:"Review resolution attempt 2",hash:"0xd44b5a1229426af1634f54b4729388461281c27271f4ecc9cbb6d9356434259e",phase:"UNDETERMINED",execution:"FINISHED_WITH_ERROR",milestone:true},
  ],
  "v2-studio-b-fault-r2-358323c":[
    {label:"Deal created",hash:"0x3942e54d91413db10315b9282e70098367c9a3d66e5a93054450df0a43640055",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Funded",hash:"0xf8a830f8160aa5902be588d913118fb1852e73ba42f18b8983073ff68d2ed4bb",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A accepted",hash:"0x9df2aea19fa09bd22e9487c91360b6038cf27703f301eed16c19d1a5d2036067",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Agent A submitted",hash:"0x8eed7e1776e4229398402f9aee9145b991ae607016ee87a788d3996454bd4983",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B accepted",hash:"0x7fc338a795afa4808c399d2c02ef9d8e6726188b4182fe63b26fc29c72b16209",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Agent B submitted",hash:"0xd06ac7d4c6ae6f9930c6254a66e2667f63d3407198964d5ff60fc6c6f70c931b",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Review requested",hash:"0x3f021727b45131346dd6adb16af4eb62b37bd8f7f138bd1a449992b58c9a5804",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:false},
    {label:"Review resolved",hash:"0xffd833e4c89704b16cfc27dfc6523691de7b15c0589d805e32a8f8ff9fa701b5",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A payout dispatched",hash:"0x40f1e560c4cda6531223dff347b5b848565eb844299607aa348a8be52ad85c45",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A bond return dispatched",hash:"0x82ff1735e37be2cb1b77f38ac85fc28f03b07521277c144e7aa3ff57f6a8692d",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B refund dispatched",hash:"0x725ba345f5a14a7de3ccd435b91356cacfd54e9c8b0a9ee4c92a406ae77d07b5",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B bond return dispatched",hash:"0xf606da8f7a8e9765270ed68a138c8e0055f817e585661fd41f5a48f5525ad825",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
  ],
  "v2-hosted-agent-live-1":[
    {label:"Deal created",hash:"0x0abef0cc4ee6687aa894ec254ee0607d3fa9a84721508dbc3dc7f735c086ddef",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Funded",hash:"0xe507cd8c8262c09060b286c186fec3c7976a24682bfa04df6f63ce98136782f7",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A accepted",hash:"0xb184c2683802d607fcca065c7598ae1a062e344f774ebe48d8159bb7a5cf7293",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B accepted",hash:"0xad10f0082b9f107145c8cefcca7dd6357f82bab79104b14d6572f830640f5cff",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A submission attempt",hash:"0x03e4b526bcc69df0aaa59e4d3abb059a62e371cc684ef1a9ae7e4aa431918568",phase:"FINALIZED_ERROR",execution:"FINISHED_WITH_ERROR",milestone:true},
  ],
  "v2-hosted-agent-live-2":[
    {label:"Deal created",hash:"0x3dd8378dca3e6393edcd2b0cccbb004595b4732535681b5efc29dbff12a3cc27",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Funded",hash:"0x02f5544a87837689d69236cd6fd95f7091163d4545ab463763e83799e99f2139",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A accepted",hash:"0x8d1345d04e4ecdd8610528010739ff187524cdd0d3c28d0fc147bb4c1ead08c6",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent A submitted",hash:"0xb944a208be646a81520572a3b61a17a79c81dd3137aa76ee94fea343b7925dac",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B accepted",hash:"0x5d771b192c3e6573b888b4f67c57c4bfb65a5912fdf1baa996ed9988cd109ad3",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Agent B submitted",hash:"0x6f4332dd4d2bc75c7507789dad11cc05965892ab98b9f3f7949307a41b09c2b5",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Review requested",hash:"0x39a833fdfc4f6b83d45a62f1b8882507510cdea316d619a035dab82ac8bdc48c",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
    {label:"Review resolved",hash:"0x95d78f0ca93080220715e6615b397450a80af9fe965c0b57d953d494e569b6d1",phase:"FINALIZED_SUCCESS",execution:"FINISHED_WITH_RETURN",milestone:true},
  ],
};

export type ActivityContext="DEAL"|"A"|"B"|"REVIEW";

export function activityForContext(dealId:string,context:ActivityContext):OnchainActivityItem[]{
  const items=onchainActivityByDeal[dealId]??[];
  if(context==="DEAL")return items.filter(item=>item.label==="Deal created"||item.label==="Funded");
  if(context==="A")return items.filter(item=>item.label.startsWith("Agent A accepted")||item.label.startsWith("Agent A submitted")||item.label.startsWith("Agent A submission"));
  if(context==="B")return items.filter(item=>item.label.startsWith("Agent B accepted")||item.label.startsWith("Agent B submitted")||item.label.startsWith("Agent B submission"));
  return items.filter(item=>item.label.startsWith("Review"));
}

const settlementHashesByLeg:Record<string,Record<string,string>>={
  "v2-studio-no-fault-358323c":{
    "A:PAYOUT":"0x7453551caef14b18732b7476f88d4fbbb6139966475be4fddd0c2bee9b2b1dd1",
    "A:BOND_RETURN":"0x9419eaccd1214f9ebb2e04a0644c5e499b65968eb70656df0996190e3b8cedae",
    "B:PAYOUT":"0xd840e3776a6a4e6b856c8e8e9b0411a392a491070c9ea7a291d2411f22d2f210",
    "B:BOND_RETURN":"0x41360d47b006149b3e2b452b904cdfc0962ef956ee6712ea7d7f741edad85a0f",
  },
  "v2-studio-a-fault-r3-358323c":{
    "A:REFUND":"0x1aef433655ab49d76c63bc5a72161236c4c8b0f2867cba868c2f179939c3d04b",
    "A:BOND_RETURN":"0x389711cd7c833d0a0d0da0249e768c0f118e52c4bc61f039a0f9cb6e20916b19",
    "B:PAYOUT":"0xce8f637cc9d74435898578ff5df00c0b897cbc0f7d4d3f88959673da4f9727d4",
    "B:BOND_RETURN":"0x5261b05d41e9420f717c10c1bcb5b442d61dc41dcec391a72b0a04a1407fe43c",
  },
  "v2-studio-b-fault-r2-358323c":{
    "A:PAYOUT":"0x40f1e560c4cda6531223dff347b5b848565eb844299607aa348a8be52ad85c45",
    "A:BOND_RETURN":"0x82ff1735e37be2cb1b77f38ac85fc28f03b07521277c144e7aa3ff57f6a8692d",
    "B:REFUND":"0x725ba345f5a14a7de3ccd435b91356cacfd54e9c8b0a9ee4c92a406ae77d07b5",
    "B:BOND_RETURN":"0xf606da8f7a8e9765270ed68a138c8e0055f817e585661fd41f5a48f5525ad825",
  },
};

export function activityForSettlementLeg(dealId:string,legId:string):OnchainActivityItem|undefined{
  const hash=settlementHashesByLeg[dealId]?.[legId];
  return hash?(onchainActivityByDeal[dealId]??[]).find(item=>item.hash===hash):undefined;
}
