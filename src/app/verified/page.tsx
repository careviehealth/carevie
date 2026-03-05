'use client';

import { CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Verified() {

    const router = useRouter();
    
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#309898]/20 via-white to-[#FF8000]/20 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 relative border-4 border-[#309898]">
        
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <CheckCircle className="w-24 h-24 text-[#309898]" />
        </div>
        
        {/* Title */}
        <h1 className="text-center text-[#309898] text-3xl font-bold mb-2">
          Email Verified Successfully
        </h1>
        
        {/* Message */}
        <p className="text-center text-gray-600 mb-8">
          Your account has been successfully verified. You can now continue to the Medical Form and Fill out your Information.
        </p>
        
        {/* Button */}
        <span
          onClick={() => {router.push('/medicalinfoform-1')}}
          className="block w-full bg-gradient-to-r from-[#309898] to-[#FF8000] text-white py-3 rounded-lg hover:shadow-lg transition transform hover:scale-105 text-center font-semibold cursor-pointer"
        >
          Fill Medical Form
        </span>
      </div>
    </div>
  );
}