import { BoltIcon } from "@heroicons/react/16/solid";
import { User, sendZap} from "../utils/helperFunctions";

interface Props {
    id: string;
    content: string;
    user: User;
    created_at: number;
    hashtags: string[];
  }
  
  export default function NoteCard({
    id,
    content,
    user,
    created_at,
    hashtags,
  }: Props) {

    return (
      <div className="rounded p-16 border border-gray-600 bg-gray-700 flex flex-col gap-16 break-words">
        <div className="flex gap-12 items-center overflow-hidden">
          {user.image ?
          <img
            src={user.image}
            alt="note"
            className="rounded-full w-40 aspect-square bg-gray-100"
          /> : <></>}
          <div>
            <span
              className="text-body3 text-white overflow-hidden text-ellipsis"
            >
              {user.name}
            </span>
            <span className="px-16 text-body5 text-gray-400">
              {new Date(created_at * 1000).toISOString().split("T")[0]}
            </span>
          </div>
        </div>
        <p>{content}</p>
        <ul className="flex flex-wrap gap-12">
          {hashtags
            .filter((t) => hashtags.indexOf(t) === hashtags.lastIndexOf(t))
            .map((hashtag) => (
              <li
                key={hashtag}
                className="bg-gray-300 text-body5 text-gray-900 font-medium rounded-24 px-12 py-4"
              >
                #{hashtag}
              </li>
            ))}
        </ul>
        <div>
          <BoltIcon
          className={user.nip05 ? "h-6 w-6 text-blue-500 cursor-pointer" : "h-6 w-6 text-grey-500 cursor-not-allowed"}
          title={user.nip05 ? "Zap " + user.name + " for this post" : user.name + " does not have zaps enabled"}
          onClick={() => sendZap(user, id)}></BoltIcon>
        </div>
      </div>
    );
  }
  