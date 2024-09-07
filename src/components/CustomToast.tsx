import React from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export const CustomToast: React.FC = () => {
  return (
    <ToastContainer
      position="bottom-right"
      autoClose={3000}
      hideProgressBar
      newestOnTop={false}
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
    />
  );
};

export const showCustomToast = (message: string) => {
  toast(
    <div className="flex items-center">
      <img 
        src="/ostrich.png" 
        alt="Ostrich" 
        className="w-64 h-64 mr-3"
      />
      <div className="relative bg-white rounded-lg p-3 ml-3">
        <div className="absolute left-0 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-0 h-0 border-t-10 border-r-10 border-b-10 border-l-0 border-white border-solid"></div>
        <p className="text-base text-black">{message}</p>
      </div>
    </div>,
    {
      className: 'bg-transparent shadow-none',
    }
  );
};