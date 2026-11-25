import React from 'react';
import { Loader2 } from 'lucide-react';

interface PageContractScannedProps {
  searchTerm: string;
  isOcrRunning?: boolean;
}

export const PageContractScanned: React.FC<PageContractScannedProps> = ({
  searchTerm,
  isOcrRunning = true,
}) => {
  const isMatch = (text: string) => {
    return searchTerm && text.includes(searchTerm);
  };

  return (
    <div className="relative w-[720px] min-h-[960px] bg-[#fdfbf7] shadow-md rounded-sm p-14 text-[#262626] font-serif border border-[#eae6df] mx-auto select-text">
      {/* Contract Title */}
      <div className="text-center mb-8">
        <h1 className="text-[26px] font-bold tracking-widest text-[#1a1a1a]">
          采 购 合 同
        </h1>
      </div>

      {/* Parties */}
      <div className="space-y-2 mb-6 text-[14px] leading-relaxed">
        <p className="font-medium">甲方：某某科技有限公司</p>
        <p className="font-medium">乙方：某某商贸有限公司</p>
      </div>

      {/* Preamble */}
      <p className="text-[14px] leading-[1.9] text-justify indent-8 mb-6">
        根据《中华人民共和国合同法》及相关法律法规，双方本着平等互利、诚实信用的原则，经友好协商，达成如下合同条款：
      </p>

      {/* Clause 1 */}
      <div className="mb-6 space-y-1.5">
        <h3 className="text-[15px] font-bold text-[#111]">第一条 合同标的</h3>
        <p className="text-[14px] leading-[1.8] text-justify indent-8">
          1.1 甲方向乙方采购以下产品：具体详见附件一。
        </p>
      </div>

      {/* Clause 2 (With Search matches: 违约责任) */}
      <div className="mb-6 space-y-1.5">
        <h3 className="text-[15px] font-bold text-[#111]">
          第二条{' '}
          <span
            className={`px-1 rounded-xs transition-colors ${
              isMatch('违约责任') ? 'bg-amber-400 font-semibold text-black ring-2 ring-amber-500' : ''
            }`}
          >
            违约责任
          </span>
        </h3>
        <p className="text-[14px] leading-[1.8] text-justify indent-8">
          2.1 任何一方违反本合同约定，应承担
          <span
            className={`px-1 rounded-xs transition-colors ${
              isMatch('违约责任') ? 'bg-amber-200 text-black' : ''
            }`}
          >
            违约责任
          </span>
          ，向守约方支付违约金，并赔偿因此造成的损失。
        </p>
      </div>

      {/* Clause 3 */}
      <div className="mb-10 space-y-1.5">
        <h3 className="text-[15px] font-bold text-[#111]">第三条 合同的变更与解除</h3>
        <p className="text-[14px] leading-[1.8] text-justify indent-8">
          3.1 本合同履行过程中，如需变更或解除，双方应协商一致，并签署书面文件。
        </p>
      </div>

      {/* Signatures & Red Official Seal */}
      <div className="relative pt-10 mt-12 grid grid-cols-2 gap-8 text-[14px]">
        <div>
          <p className="mb-4">甲方（盖章）：某某科技有限公司</p>
          <p>
            法定代表人：<span className="font-sans font-medium text-slate-800">张三</span>
          </p>
        </div>

        <div className="relative">
          <p className="mb-4">乙方（盖章）：某某商贸有限公司</p>
          <p>
            法定代表人：<span className="font-sans font-medium text-slate-800">李四</span>
          </p>

          {/* Realistic SVG Red Official Seal / Stamp */}
          <div
            className="absolute -top-10 left-16 w-32 h-32 pointer-events-none transform -rotate-12 opacity-85 select-none"
            title="合同专用章"
          >
            <svg viewBox="0 0 100 100" className="w-full h-full text-red-600 fill-current">
              {/* Outer double circle */}
              <circle cx="50" cy="50" r="46" fill="none" stroke="#dc2626" strokeWidth="2.5" />
              <circle cx="50" cy="50" r="43" fill="none" stroke="#dc2626" strokeWidth="1" />

              {/* Star in center */}
              <polygon
                points="50,34 53.5,43 63,43 55,49 58,58 50,52 42,58 45,49 37,43 46.5,43"
                fill="#dc2626"
              />

              {/* Arc text on top: 某某商贸有限公司 */}
              <path id="seal-text-path" d="M 16,50 A 34,34 0 1,1 84,50" fill="none" />
              <text fontSize="8.5" fontWeight="bold" fill="#dc2626" letterSpacing="1.8">
                <textPath href="#seal-text-path" startOffset="50%" textAnchor="middle">
                  某某商贸有限公司
                </textPath>
              </text>

              {/* Horizontal text at bottom: 合同专用章 */}
              <text
                x="50"
                y="74"
                fontSize="7.5"
                fontWeight="bold"
                fill="#dc2626"
                textAnchor="middle"
                letterSpacing="1"
              >
                合同专用章
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* Page OCR Progress Indicator at bottom (Image 4) */}
      {isOcrRunning && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center space-x-2 bg-white/90 backdrop-blur-xs border border-slate-200 px-4 py-1.5 rounded-full shadow-sm text-[12px] text-blue-600 font-sans font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
          <span>正在识别文字...</span>
        </div>
      )}
    </div>
  );
};
