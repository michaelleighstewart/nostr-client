
import { useState } from "react";

const EditProfile = () => {
    const [name, setName] = useState('');
    const [about, setAbout] = useState('');
    const [picture, setPicture] = useState('');

    return (
        <div className="flex flex-col gap-16">
            <div>
                <div className="px-32 py-32">
                    <label htmlFor="name" 
                        className="block mb-2 text-sm font-medium text-white">Name: </label>
                    <input type="text" id="name" 
                        className={"text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"} 
                        placeholder={"John Smith"}
                        value={name}
                        onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="px-32 py-32">
                    <label htmlFor="about" 
                        className="block mb-2 text-sm font-medium text-white">About: </label>
                    <input type="text" id="about" 
                        className={"text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"} 
                        placeholder={"Something about you..."}
                        value={about}
                        onChange={(e) => setAbout(e.target.value)} />
                </div>
                <div className="px-32 py-32">
                    <label htmlFor="picture" 
                        className="block mb-2 text-sm font-medium text-white">Picture: </label>
                    <input type="text" id="picture" 
                        className={"text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"} 
                        placeholder={"Location of avatar picture"}
                        value={picture}
                        onChange={(e) => setPicture(e.target.value)} />
                </div>
            </div>
        </div>
    );
  }
  
  export default EditProfile;